import type {
  Card,
  CardColor,
  GameState,
  Player,
  ChallengeState,
  PlayDirection,
  ClientGameState,
} from '@uno-web/shared';
import { toClientGameState as toClientGameStateImport } from '@uno-web/shared';
import { createDeck, shuffleDeck, canPlayCard } from './DeckManager';

const HAND_SIZE = 7;
const MAX_RESHUFFLES = 20;

export class GameManager {
  private games: Map<string, GameState> = new Map();

  createGame(roomId: string, players: Player[], hostId: string): GameState {
    let deck = shuffleDeck(createDeck());
    const dealerIndex = this.determineDealerIndex(deck, players.length);
    deck = shuffleDeck(deck);

    const gamePlayers = players.map(p => ({
      ...p,
      hand: [] as Card[],
      status: 'playing' as const,
      hasCalledUno: false,
    }));

    for (const player of gamePlayers) {
      for (let i = 0; i < HAND_SIZE; i++) {
        const card = deck.pop();
        if (card) {
          player.hand.push(card);
        }
      }
    }

    let firstCard = deck.pop();
    while (firstCard && (firstCard.color === 'Wild')) {
      deck.unshift(firstCard);
      shuffleDeck(deck);
      firstCard = deck.pop();
    }

    const discardPile: Card[] = [];
    if (firstCard) {
      discardPile.push(firstCard);
    }

    let initialPlayerIndex = dealerIndex;

    let pendingPenalty = 0;
    if (firstCard) {
      if (firstCard.value === 'Draw2') {
        pendingPenalty = 2;
      }
    }

    const state: GameState = {
      roomId,
      phase: 'playing',
      players: gamePlayers,
      currentPlayerIndex: initialPlayerIndex,
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
    };

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
    if (state.phase === 'finished') {
      return { success: false, error: 'Game already finished' };
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
      if (state.phase === 'finished') {
        return { success: true };
      }
      const player = state.players.find(p => p.id === playerId)!;
      player.hand.push(...cards);
      this.syncUnoStatus(player);
      state.pendingPenalty = 0;
      state.lastDrawnCardId = null;
      this.advanceTurn(state);
      return { success: true, card: cards[0] };
    }

    const drawn = this.drawCards(state, 1);
    if (state.phase === 'finished') {
      return { success: true };
    }
    const card = drawn[0];
    const player = state.players.find(p => p.id === playerId)!;
    player.hand.push(card);
    this.syncUnoStatus(player);
    state.hasDrawnThisTurn = true;
    state.lastDrawnCardId = card.id;

    const topCard = state.discardPile[state.discardPile.length - 1];
    if (!canPlayCard(card, topCard, state.activeColor)) {
      state.hasDrawnThisTurn = false;
      state.lastDrawnCardId = null;
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
    if (state.phase === 'finished') {
      return { success: false, error: 'Game already finished' };
    }

    if (!state.directionChosen) {
      return { success: false, error: 'Direction not chosen yet' };
    }

    if (state.challengeState && !state.challengeState.resolved) {
      return { success: false, error: 'Challenge pending' };
    }

    const playerIndex = state.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      return { success: false, error: 'Player not found' };
    }

    if (state.currentPlayerIndex !== playerIndex) {
      return { success: false, error: 'Not your turn' };
    }

    const player = state.players[playerIndex];
    const cardIndex = player.hand.findIndex(c => c.id === cardId);
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

    if (state.pendingPenalty > 0) {
      if (card.value !== 'Draw2' && card.value !== 'WildDraw4') {
        return { success: false, error: 'Must play +2 or +4 to stack, or draw penalty cards' };
      }
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

    if (player.hand.length === 0) {
      state.phase = 'finished';
      state.winnerId = player.id;
      state.isDraw = false;
      state.pendingPenalty = 0;
      state.challengeState = null;
      return { success: true };
    }

    if (card.value === 'Draw2') {
      state.pendingPenalty += 2;
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
      this.advanceTurn(state);
      return { success: true };
    }

    if (card.value === 'Skip') {
      this.advanceTurn(state);
      this.advanceTurn(state);
    } else if (card.value === 'Reverse') {
      state.direction = (state.direction * -1) as PlayDirection;
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
    if (state.phase === 'finished') {
      return { success: false, error: 'Game already finished' };
    }

    const player = state.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    if (player.hand.length === 1) {
      player.hasCalledUno = true;
      return { success: true };
    }

    return { success: false, error: 'Can only call UNO with 1 card' };
  }

  handleChallenge(
    state: GameState,
    challengerId: string,
    challenged: boolean
  ): { success: boolean; error?: string } {
    if (state.phase === 'finished') {
      return { success: false, error: 'Game already finished' };
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
      if (state.phase === 'finished') {
        return { success: true };
      }
      challenger.hand.push(...cards);
      this.syncUnoStatus(challenger);
      state.pendingPenalty = 0;
      state.challengeState.resolved = true;
      state.challengeState.challengeSuccess = false;
      this.advanceTurn(state);
      return { success: true };
    }

    const wildCard = state.discardPile[state.discardPile.length - 1];

    let hasMatchingCard = false;
    if (wildCard.color === 'Wild') {
      hasMatchingCard = wildPlayer.hand.some(
        card => card.color === state.challengeState.previousColor && card.color !== 'Wild'
      );
    }

    state.challengeState.resolved = true;

    if (hasMatchingCard) {
      const cards = this.drawCards(state, 4);
      if (state.phase === 'finished') {
        return { success: true };
      }
      wildPlayer.hand.push(...cards);
      this.syncUnoStatus(wildPlayer);
      state.pendingPenalty = 0;
      state.challengeState.challengeSuccess = true;
    } else {
      const cards = this.drawCards(state, 6);
      if (state.phase === 'finished') {
        return { success: true };
      }
      challenger.hand.push(...cards);
      this.syncUnoStatus(challenger);
      state.pendingPenalty = 0;
      state.challengeState.challengeSuccess = false;
    }

    this.advanceTurn(state);
    return { success: true };
  }

  chooseDirection(
    state: GameState,
    playerId: string,
    direction: PlayDirection
  ): { success: boolean; error?: string } {
    if (state.phase === 'finished') {
      return { success: false, error: 'Game already finished' };
    }

    if (state.directionChosen) {
      return { success: false, error: 'Direction already chosen' };
    }

    if (state.players[state.currentPlayerIndex].id !== playerId) {
      return { success: false, error: 'Only the dealer can choose direction' };
    }

    state.direction = direction;
    state.directionChosen = true;

    if (!state.initialEffectApplied) {
      const firstCard = state.discardPile[state.discardPile.length - 1];
      if (firstCard?.value === 'Reverse') {
        state.direction = (state.direction * -1) as PlayDirection;
      } else if (firstCard?.value === 'Skip') {
        this.advanceTurn(state);
      } else if (firstCard?.value === 'Draw2') {
        state.pendingPenalty = Math.max(state.pendingPenalty, 2);
      }
      state.initialEffectApplied = true;
    }

    return { success: true };
  }

  endTurn(state: GameState, playerId: string): { success: boolean; error?: string } {
    if (state.phase === 'finished') {
      return { success: false, error: 'Game already finished' };
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

    state.hasDrawnThisTurn = false;
    state.lastDrawnCardId = null;
    this.advanceTurn(state);
    return { success: true };
  }

  private drawCards(state: GameState, count: number): Card[] {
    const cards: Card[] = [];
    for (let i = 0; i < count; i++) {
      if (state.drawPile.length === 0) {
        if (state.discardPile.length > 1 && state.reshuffleCount < MAX_RESHUFFLES) {
          const topCard = state.discardPile.pop();
          if (topCard) {
            state.drawPile = shuffleDeck(state.discardPile);
            state.discardPile = [topCard];
            state.reshuffleCount += 1;
          }
        } else {
          state.phase = 'finished';
          state.winnerId = null;
          state.isDraw = true;
          state.pendingPenalty = 0;
          state.challengeState = null;
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
        return { index, card, score: card ? getCardScore(card) : 0 };
      });

      const maxScore = Math.max(...roundResults.map(result => result.score));
      candidates = roundResults
        .filter(result => result.score === maxScore)
        .map(result => result.index);
    }

    deck.push(...drawnCards);
    return candidates[0] ?? 0;
  }

  toClientGameState(state: GameState, playerId: string): ClientGameState {
    return toClientGameStateImport(state, playerId);
  }
}

export const gameManager = new GameManager();
