import type {
  Card,
  CardColor,
  GameState,
  Player,
  ChallengeState,
  PlayDirection,
  ClientGameState,
  toClientGameState as toClientGameStateImport,
} from '@uno-web/shared';
import { createDeck, shuffleDeck, canPlayCard, hasPlayableCard, getHighestCardValue } from './DeckManager';

const HAND_SIZE = 7;

export class GameManager {
  private games: Map<string, GameState> = new Map();

  createGame(roomId: string, players: Player[]): GameState {
    const deck = shuffleDeck(createDeck());

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

    const initialDirection: PlayDirection = Math.random() < 0.5 ? 1 : -1;

    let initialPlayerIndex = Math.floor(Math.random() * gamePlayers.length);

    let pendingPenalty = 0;
    if (firstCard) {
      if (firstCard.value === 'Draw2') {
        pendingPenalty = 2;
      } else if (firstCard.value === 'Skip') {
        initialPlayerIndex = (initialPlayerIndex + initialDirection + gamePlayers.length) % gamePlayers.length;
      } else if (firstCard.value === 'Reverse') {
      }
    }

    const state: GameState = {
      roomId,
      phase: 'playing',
      players: gamePlayers,
      currentPlayerIndex: initialPlayerIndex,
      direction: initialDirection,
      drawPile: deck,
      discardPile,
      activeColor: null,
      pendingPenalty,
      hostId: players[0].id,
      hasDrawnThisTurn: false,
      lastPlayedCard: null,
      challengeState: null,
      winnerId: null,
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
    if (state.players[state.currentPlayerIndex].id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    if (state.hasDrawnThisTurn) {
      return { success: false, error: 'Already drawn this turn' };
    }

    if (state.pendingPenalty > 0) {
      const cards = this.drawCards(state, state.pendingPenalty);
      const player = state.players.find(p => p.id === playerId)!;
      player.hand.push(...cards);
      state.pendingPenalty = 0;
      this.advanceTurn(state);
      return { success: true, card: cards[0] };
    }

    const card = this.drawCards(state, 1)[0];
    const player = state.players.find(p => p.id === playerId)!;
    player.hand.push(card);
    state.hasDrawnThisTurn = true;

    return { success: true, card };
  }

  playCard(
    state: GameState,
    playerId: string,
    cardId: string,
    chosenColor?: CardColor
  ): { success: boolean; error?: string } {
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

    if (state.pendingPenalty > 0) {
      if (card.value !== 'Draw2' && card.value !== 'WildDraw4') {
        return { success: false, error: 'Must play +2 or +4 to stack, or draw penalty cards' };
      }
    }

    if (!canPlayCard(card, topCard, state.activeColor)) {
      return { success: false, error: 'Cannot play this card' };
    }

    player.hand.splice(cardIndex, 1);
    state.discardPile.push(card);
    state.lastPlayedCard = card;
    state.hasDrawnThisTurn = false;
    state.activeColor = null;

    if (card.color === 'Wild') {
      if (!chosenColor || chosenColor === 'Wild') {
        return { success: false, error: 'Must choose a color for wild card' };
      }
      state.activeColor = chosenColor;
    }

    if (card.value === 'Draw2') {
      state.pendingPenalty += 2;
    } else if (card.value === 'WildDraw4') {
      state.pendingPenalty += 4;
      const nextIndex = this.getNextPlayerIndex(state);
      state.challengeState = {
        challengerIndex: nextIndex,
        wildDraw4PlayerIndex: playerIndex,
        resolved: false,
        challengeSuccess: null,
      };
      return { success: true };
    }

    if (player.hand.length === 0) {
      state.phase = 'finished';
      state.winnerId = player.id;
      return { success: true };
    }

    if (player.hand.length === 1 && !player.hasCalledUno) {
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
    const player = state.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    if (player.hand.length <= 2) {
      player.hasCalledUno = true;
      return { success: true };
    }

    return { success: false, error: 'Can only call UNO with 2 or fewer cards' };
  }

  handleChallenge(
    state: GameState,
    challengerId: string,
    challenged: boolean
  ): { success: boolean; error?: string } {
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
      challenger.hand.push(...cards);
      state.pendingPenalty = 0;
      state.challengeState.resolved = true;
      state.challengeState.challengeSuccess = false;
      this.advanceTurn(state);
      return { success: true };
    }

    const topCardBeforeWild = state.discardPile[state.discardPile.length - 2];
    const wildCard = state.discardPile[state.discardPile.length - 1];

    let hasMatchingCard = false;
    if (topCardBeforeWild && wildCard.color === 'Wild') {
      const previousColor = state.activeColor || topCardBeforeWild.color;
      hasMatchingCard = wildPlayer.hand.some(
        card => card.color === previousColor && card.color !== 'Wild'
      );
    }

    state.challengeState.resolved = true;

    if (hasMatchingCard) {
      const cards = this.drawCards(state, 4);
      wildPlayer.hand.push(...cards);
      state.pendingPenalty = 0;
      state.challengeState.challengeSuccess = true;
    } else {
      const cards = this.drawCards(state, 6);
      challenger.hand.push(...cards);
      state.pendingPenalty = 0;
      state.challengeState.challengeSuccess = false;
    }

    this.advanceTurn(state);
    return { success: true };
  }

  private drawCards(state: GameState, count: number): Card[] {
    const cards: Card[] = [];
    for (let i = 0; i < count; i++) {
      if (state.drawPile.length === 0) {
        const topCard = state.discardPile.pop();
        if (topCard) {
          state.drawPile = shuffleDeck(state.discardPile);
          state.discardPile = [topCard];
        } else {
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
    state.currentPlayerIndex = this.getNextPlayerIndex(state);
    state.hasDrawnThisTurn = false;

    const currentPlayer = state.players[state.currentPlayerIndex];
    if (currentPlayer.hand.length > 1) {
      currentPlayer.hasCalledUno = false;
    }
  }

  private getNextPlayerIndex(state: GameState): number {
    const totalPlayers = state.players.length;
    return (state.currentPlayerIndex + state.direction + totalPlayers) % totalPlayers;
  }

  toClientGameState(state: GameState, playerId: string): ClientGameState {
    const myPlayerIndex = state.players.findIndex(p => p.id === playerId);
    if (myPlayerIndex === -1) {
      throw new Error(`Player ${playerId} not found in game`);
    }

    const myPlayer = state.players[myPlayerIndex];
    const otherPlayers = state.players
      .filter((_, index) => index !== myPlayerIndex)
      .map(p => ({
        id: p.id,
        name: p.name,
        handCount: p.hand.length,
        status: p.status,
        hasCalledUno: p.hasCalledUno,
      }));

    const topCard = state.discardPile[state.discardPile.length - 1];

    return {
      roomId: state.roomId,
      phase: state.phase,
      myPlayer,
      otherPlayers,
      currentPlayerIndex: state.currentPlayerIndex,
      myPlayerIndex,
      direction: state.direction,
      topCard,
      drawPileCount: state.drawPile.length,
      activeColor: state.activeColor,
      pendingPenalty: state.pendingPenalty,
      hostId: state.hostId,
      hasDrawnThisTurn: state.hasDrawnThisTurn,
      lastPlayedCard: state.lastPlayedCard,
      challengeState: state.challengeState,
      winnerId: state.winnerId,
    };
  }
}

export const gameManager = new GameManager();
