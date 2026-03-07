import type {
  Card,
  CardColor,
  ClientGameState,
  GameLogEntry,
  GameState,
  PlayDirection,
  Player,
} from '@uno-web/shared';
import { toClientGameState as mapToClientGameState } from '@uno-web/shared';
import { canPlayCard, createDeck, shuffleDeck } from './DeckManager.js';

const HAND_SIZE = 7;
const MAX_RESHUFFLES = 20;
const MAX_EVENT_LOG_ITEMS = 40;
const RECONNECT_PAUSE_ERROR = 'Game paused while waiting for reconnection';

export class GameManager {
  private games: Map<string, GameState> = new Map();

  createGame(roomId: string, players: Player[], hostId: string): GameState {
    let deck = shuffleDeck(createDeck());
    const dealerIndex = this.determineDealerIndex(deck, players.length);
    deck = shuffleDeck(deck);

    const gamePlayers = players.map(player => ({
      ...player,
      hand: [] as Card[],
      status: 'playing' as const,
      hasCalledUno: false,
    }));

    for (const player of gamePlayers) {
      for (let i = 0; i < HAND_SIZE; i += 1) {
        const card = deck.pop();
        if (card) {
          player.hand.push(card);
        }
      }
    }

    let firstCard = deck.pop();
    while (firstCard && firstCard.color === 'Wild') {
      deck.unshift(firstCard);
      shuffleDeck(deck);
      firstCard = deck.pop();
    }

    const discardPile: Card[] = [];
    if (firstCard) {
      discardPile.push(firstCard);
    }

    let pendingPenalty = 0;
    if (firstCard?.value === 'Draw2') {
      pendingPenalty = 2;
    }

    const state: GameState = {
      roomId,
      phase: 'playing',
      players: gamePlayers,
      currentPlayerIndex: dealerIndex,
      direction: 1,
      directionChosen: false,
      drawPile: deck,
      discardPile,
      activeColor: null,
      pendingPenalty,
      hostId,
      hasDrawnThisTurn: false,
      lastPlayedCard: null,
      challengeState: null,
      initialEffectApplied: false,
      lastDrawnCardId: null,
      winnerId: null,
      isDraw: false,
      reshuffleCount: 0,
      eventLog: [],
    };

    this.appendLog(state, `Game started with ${state.players.length} players.`);
    this.appendLog(state, `${state.players[dealerIndex].name} is the dealer and will choose direction.`);
    if (firstCard) {
      this.appendLog(state, `Top card is ${this.formatCard(firstCard)}.`);
      if (firstCard.value === 'Draw2') {
        this.appendLog(state, 'Opening card adds a +2 penalty to the first turn.');
      }
    }

    this.games.set(roomId, state);
    return state;
  }

  getGame(roomId: string): GameState | undefined {
    return this.games.get(roomId);
  }

  removeGame(roomId: string): void {
    this.games.delete(roomId);
  }

  drawCard(state: GameState, playerId: string): { success: boolean; error?: string; card?: Card } {
    if (this.isFinished(state)) {
      return { success: false, error: 'Game already finished' };
    }

    if (this.hasDisconnectedPlayers(state)) {
      return { success: false, error: RECONNECT_PAUSE_ERROR };
    }

    if (!state.directionChosen) {
      return { success: false, error: 'Direction not chosen yet' };
    }

    if (state.challengeState && !state.challengeState.resolved) {
      return { success: false, error: 'Challenge pending' };
    }

    if (state.players[state.currentPlayerIndex].id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    if (state.hasDrawnThisTurn) {
      return { success: false, error: 'Already drawn this turn' };
    }

    if (state.pendingPenalty > 0) {
      const cards = this.drawCards(state, state.pendingPenalty);
      if (this.isFinished(state)) {
        return { success: true };
      }

      const player = state.players.find(item => item.id === playerId);
      if (!player) {
        return { success: false, error: 'Player not found' };
      }

      const penalty = state.pendingPenalty;
      player.hand.push(...cards);
      this.syncUnoStatus(player);
      state.pendingPenalty = 0;
      state.lastDrawnCardId = null;
      this.appendLog(state, `${player.name} drew ${penalty} penalty cards.`);
      this.advanceTurn(state);
      return { success: true, card: cards[0] };
    }

    const drawn = this.drawCards(state, 1);
    if (this.isFinished(state)) {
      return { success: true };
    }

    const card = drawn[0];
    const player = state.players.find(item => item.id === playerId);
    if (!player || !card) {
      return { success: false, error: 'Unable to draw card' };
    }

    player.hand.push(card);
    this.syncUnoStatus(player);
    state.hasDrawnThisTurn = true;
    state.lastDrawnCardId = card.id;
    this.appendLog(state, `${player.name} drew 1 card.`);

    const topCard = state.discardPile[state.discardPile.length - 1];
    if (!canPlayCard(card, topCard, state.activeColor)) {
      state.hasDrawnThisTurn = false;
      state.lastDrawnCardId = null;
      this.appendLog(state, `${player.name} could not play the drawn card and passed the turn.`);
      this.advanceTurn(state);
    }

    return { success: true, card };
  }

  playCard(
    state: GameState,
    playerId: string,
    cardId: string,
    chosenColor?: CardColor
  ): { success: boolean; error?: string } {
    if (this.isFinished(state)) {
      return { success: false, error: 'Game already finished' };
    }

    if (this.hasDisconnectedPlayers(state)) {
      return { success: false, error: RECONNECT_PAUSE_ERROR };
    }

    if (!state.directionChosen) {
      return { success: false, error: 'Direction not chosen yet' };
    }

    if (state.challengeState && !state.challengeState.resolved) {
      return { success: false, error: 'Challenge pending' };
    }

    const playerIndex = state.players.findIndex(player => player.id === playerId);
    if (playerIndex === -1) {
      return { success: false, error: 'Player not found' };
    }

    if (state.currentPlayerIndex !== playerIndex) {
      return { success: false, error: 'Not your turn' };
    }

    const player = state.players[playerIndex];
    const cardIndex = player.hand.findIndex(card => card.id === cardId);
    if (cardIndex === -1) {
      return { success: false, error: 'Card not in hand' };
    }

    const card = player.hand[cardIndex];
    const topCard = state.discardPile[state.discardPile.length - 1];
    const previousColor = state.activeColor ?? topCard.color;

    if (card.color === 'Wild' && (!chosenColor || chosenColor === 'Wild')) {
      return { success: false, error: 'Must choose a color for wild card' };
    }

    if (state.hasDrawnThisTurn && state.lastDrawnCardId && card.id !== state.lastDrawnCardId) {
      return { success: false, error: 'Can only play the card you just drew' };
    }

    if (state.pendingPenalty > 0 && card.value !== 'Draw2' && card.value !== 'WildDraw4') {
      return { success: false, error: 'Must play +2 or +4 to stack, or draw penalty cards' };
    }

    if (state.pendingPenalty === 0 && !canPlayCard(card, topCard, state.activeColor)) {
      return { success: false, error: 'Cannot play this card' };
    }

    player.hand.splice(cardIndex, 1);
    this.syncUnoStatus(player);
    state.discardPile.push(card);
    state.lastPlayedCard = card;
    state.hasDrawnThisTurn = false;
    state.lastDrawnCardId = null;
    state.activeColor = null;

    if (card.color === 'Wild') {
      state.activeColor = chosenColor ?? null;
    }

    this.appendLog(state, `${player.name} played ${this.formatCard(card, chosenColor)}.`);

    if (player.hand.length === 0) {
      state.phase = 'finished';
      state.winnerId = player.id;
      state.isDraw = false;
      state.pendingPenalty = 0;
      state.challengeState = null;
      this.appendLog(state, `${player.name} wins the game.`);
      return { success: true };
    }

    if (card.value === 'Draw2') {
      state.pendingPenalty += 2;
      this.appendLog(state, `Penalty stack is now +${state.pendingPenalty}.`);
    } else if (card.value === 'WildDraw4') {
      state.pendingPenalty += 4;
      const nextIndex = this.getNextPlayerIndex(state);
      state.challengeState = {
        challengerIndex: nextIndex,
        wildDraw4PlayerIndex: playerIndex,
        previousColor,
        resolved: false,
        challengeSuccess: null,
      };
      this.appendLog(state, `${state.players[nextIndex].name} can accept or challenge Wild Draw 4.`);
      this.advanceTurn(state);
      return { success: true };
    }

    if (card.value === 'Skip') {
      this.appendLog(state, 'Next player is skipped.');
      this.advanceTurn(state);
      this.advanceTurn(state);
    } else if (card.value === 'Reverse') {
      state.direction = (state.direction * -1) as PlayDirection;
      this.appendLog(state, `Direction changed to ${state.direction === 1 ? 'clockwise' : 'counterclockwise'}.`);
      if (state.players.length === 2) {
        this.advanceTurn(state);
        this.advanceTurn(state);
      } else {
        this.advanceTurn(state);
      }
    } else {
      this.advanceTurn(state);
    }

    return { success: true };
  }

  callUno(state: GameState, playerId: string): { success: boolean; error?: string } {
    if (this.isFinished(state)) {
      return { success: false, error: 'Game already finished' };
    }

    if (this.hasDisconnectedPlayers(state)) {
      return { success: false, error: RECONNECT_PAUSE_ERROR };
    }

    const player = state.players.find(item => item.id === playerId);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    if (player.hand.length === 1) {
      player.hasCalledUno = true;
      this.appendLog(state, `${player.name} called UNO.`);
      return { success: true };
    }

    return { success: false, error: 'Can only call UNO with 1 card' };
  }

  handleChallenge(
    state: GameState,
    challengerId: string,
    challenged: boolean
  ): { success: boolean; error?: string } {
    if (this.isFinished(state)) {
      return { success: false, error: 'Game already finished' };
    }

    if (this.hasDisconnectedPlayers(state)) {
      return { success: false, error: RECONNECT_PAUSE_ERROR };
    }

    if (!state.challengeState || state.challengeState.resolved) {
      return { success: false, error: 'No challenge in progress' };
    }

    const challenger = state.players[state.challengeState.challengerIndex];
    if (challenger.id !== challengerId) {
      return { success: false, error: 'Not your challenge to respond to' };
    }

    const wildPlayer = state.players[state.challengeState.wildDraw4PlayerIndex];

    if (!challenged) {
      const cards = this.drawCards(state, state.pendingPenalty);
      if (this.isFinished(state)) {
        return { success: true };
      }
      const penalty = state.pendingPenalty;
      challenger.hand.push(...cards);
      this.syncUnoStatus(challenger);
      state.pendingPenalty = 0;
      state.challengeState.resolved = true;
      state.challengeState.challengeSuccess = false;
      this.appendLog(state, `${challenger.name} accepted the challenge and drew ${penalty} cards.`);
      this.advanceTurn(state);
      return { success: true };
    }

    const wildCard = state.discardPile[state.discardPile.length - 1];
    let hasMatchingCard = false;
    if (wildCard.color === 'Wild') {
      hasMatchingCard = wildPlayer.hand.some(
        card => card.color === state.challengeState?.previousColor && card.color !== 'Wild'
      );
    }

    state.challengeState.resolved = true;

    if (hasMatchingCard) {
      const cards = this.drawCards(state, 4);
      if (this.isFinished(state)) {
        return { success: true };
      }
      wildPlayer.hand.push(...cards);
      this.syncUnoStatus(wildPlayer);
      state.pendingPenalty = 0;
      state.challengeState.challengeSuccess = true;
      this.appendLog(state, `${challenger.name} challenged successfully. ${wildPlayer.name} drew 4 cards.`);
    } else {
      const cards = this.drawCards(state, 6);
      if (this.isFinished(state)) {
        return { success: true };
      }
      challenger.hand.push(...cards);
      this.syncUnoStatus(challenger);
      state.pendingPenalty = 0;
      state.challengeState.challengeSuccess = false;
      this.appendLog(state, `${challenger.name} challenged unsuccessfully and drew 6 cards.`);
    }

    this.advanceTurn(state);
    return { success: true };
  }

  chooseDirection(
    state: GameState,
    playerId: string,
    direction: PlayDirection
  ): { success: boolean; error?: string } {
    if (this.isFinished(state)) {
      return { success: false, error: 'Game already finished' };
    }

    if (this.hasDisconnectedPlayers(state)) {
      return { success: false, error: RECONNECT_PAUSE_ERROR };
    }

    if (state.directionChosen) {
      return { success: false, error: 'Direction already chosen' };
    }

    if (state.players[state.currentPlayerIndex].id !== playerId) {
      return { success: false, error: 'Only the dealer can choose direction' };
    }

    state.direction = direction;
    state.directionChosen = true;
    this.appendLog(state, `${state.players[state.currentPlayerIndex].name} set direction to ${direction === 1 ? 'clockwise' : 'counterclockwise'}.`);

    if (!state.initialEffectApplied) {
      const firstCard = state.discardPile[state.discardPile.length - 1];
      if (firstCard?.value === 'Reverse') {
        state.direction = (state.direction * -1) as PlayDirection;
        this.appendLog(state, 'Opening Reverse flips the chosen direction.');
      } else if (firstCard?.value === 'Skip') {
        this.appendLog(state, 'Opening Skip skips the first player after dealer.');
        this.advanceTurn(state);
      } else if (firstCard?.value === 'Draw2') {
        state.pendingPenalty = Math.max(state.pendingPenalty, 2);
      }
      state.initialEffectApplied = true;
    }

    return { success: true };
  }

  endTurn(state: GameState, playerId: string): { success: boolean; error?: string } {
    if (this.isFinished(state)) {
      return { success: false, error: 'Game already finished' };
    }

    if (this.hasDisconnectedPlayers(state)) {
      return { success: false, error: RECONNECT_PAUSE_ERROR };
    }

    if (!state.directionChosen) {
      return { success: false, error: 'Direction not chosen yet' };
    }

    if (state.challengeState && !state.challengeState.resolved) {
      return { success: false, error: 'Challenge pending' };
    }

    if (state.players[state.currentPlayerIndex].id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    if (!state.hasDrawnThisTurn) {
      return { success: false, error: 'Must draw before ending your turn' };
    }

    const player = state.players[state.currentPlayerIndex];
    state.hasDrawnThisTurn = false;
    state.lastDrawnCardId = null;
    this.appendLog(state, `${player.name} ended the turn.`);
    this.advanceTurn(state);
    return { success: true };
  }

  private isFinished(state: GameState): boolean {
    return state.phase === 'finished';
  }

  private hasDisconnectedPlayers(state: GameState): boolean {
    return state.players.some(player => !player.connected);
  }

  private drawCards(state: GameState, count: number): Card[] {
    const cards: Card[] = [];
    for (let i = 0; i < count; i += 1) {
      if (state.drawPile.length === 0) {
        if (state.discardPile.length > 1 && state.reshuffleCount < MAX_RESHUFFLES) {
          const topCard = state.discardPile.pop();
          if (topCard) {
            state.drawPile = shuffleDeck(state.discardPile);
            state.discardPile = [topCard];
            state.reshuffleCount += 1;
            this.appendLog(state, 'Draw pile reshuffled from discard pile.');
          }
        } else {
          state.phase = 'finished';
          state.winnerId = null;
          state.isDraw = true;
          state.pendingPenalty = 0;
          state.challengeState = null;
          this.appendLog(state, 'No cards left to draw. Game ended in a draw.');
          break;
        }
      }

      const card = state.drawPile.pop();
      if (card) {
        cards.push(card);
      }
    }
    return cards;
  }

  private advanceTurn(state: GameState): void {
    const previousPlayer = state.players[state.currentPlayerIndex];
    if (previousPlayer.hand.length === 1 && !previousPlayer.hasCalledUno) {
      const penaltyCards = this.drawCards(state, 2);
      previousPlayer.hand.push(...penaltyCards);
      this.syncUnoStatus(previousPlayer);
      this.appendLog(state, `${previousPlayer.name} forgot UNO and drew 2 penalty cards.`);
    }

    state.currentPlayerIndex = this.getNextPlayerIndex(state);
    state.hasDrawnThisTurn = false;
    state.lastDrawnCardId = null;

    const currentPlayer = state.players[state.currentPlayerIndex];
    this.syncUnoStatus(currentPlayer);
  }

  private syncUnoStatus(player: Player): void {
    if (player.hand.length !== 1) {
      player.hasCalledUno = false;
    }
  }

  private getNextPlayerIndex(state: GameState): number {
    const totalPlayers = state.players.length;
    return (state.currentPlayerIndex + state.direction + totalPlayers) % totalPlayers;
  }

  private determineDealerIndex(deck: Card[], totalPlayers: number): number {
    let candidates = Array.from({ length: totalPlayers }, (_, index) => index);
    const drawnCards: Card[] = [];

    const getCardScore = (card: Card): number => {
      if (card.color === 'Wild') return 0;
      const numeric = parseInt(card.value, 10);
      return Number.isNaN(numeric) ? 0 : numeric;
    };

    while (candidates.length > 1) {
      const roundResults = candidates.map(index => {
        const card = deck.pop();
        if (card) {
          drawnCards.push(card);
        }
        return { index, score: card ? getCardScore(card) : 0 };
      });

      const maxScore = Math.max(...roundResults.map(result => result.score));
      candidates = roundResults.filter(result => result.score === maxScore).map(result => result.index);
    }

    deck.push(...drawnCards);
    return candidates[0] ?? 0;
  }

  private appendLog(state: GameState, message: string): void {
    const entry: GameLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      message,
    };
    state.eventLog.push(entry);
    if (state.eventLog.length > MAX_EVENT_LOG_ITEMS) {
      state.eventLog.splice(0, state.eventLog.length - MAX_EVENT_LOG_ITEMS);
    }
  }

  private formatCard(card: Card, chosenColor?: CardColor): string {
    if (card.color === 'Wild') {
      const suffix = chosenColor && chosenColor !== 'Wild' ? ` (${chosenColor})` : '';
      if (card.value === 'WildDraw4') {
        return `Wild Draw 4${suffix}`;
      }
      return `Wild${suffix}`;
    }
    return `${card.color} ${card.value}`;
  }

  toClientGameState(state: GameState, playerId: string): ClientGameState {
    return mapToClientGameState(state, playerId);
  }
}

export const gameManager = new GameManager();

