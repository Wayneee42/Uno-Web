import type { Card, CardColor } from './card.js';
import type { Player, PublicPlayer } from './player.js';

export type GamePhase = 'waiting' | 'dealing' | 'playing' | 'finished';

export type PlayDirection = 1 | -1;

export interface GameLogEntry {
  id: string;
  createdAt: number;
  message: string;
}

export interface GameState {
  roomId: string;
  phase: GamePhase;
  players: Player[];
  currentPlayerIndex: number;
  direction: PlayDirection;
  directionChosen: boolean;
  drawPile: Card[];
  discardPile: Card[];
  activeColor: CardColor | null;
  pendingPenalty: number;
  hostId: string;
  hasDrawnThisTurn: boolean;
  lastPlayedCard: Card | null;
  challengeState: ChallengeState | null;
  initialEffectApplied: boolean;
  lastDrawnCardId: string | null;
  winnerId: string | null;
  reshuffleCount: number;
  isDraw: boolean;
  eventLog: GameLogEntry[];
}

export interface ChallengeState {
  challengerIndex: number;
  wildDraw4PlayerIndex: number;
  previousColor: CardColor;
  resolved: boolean;
  challengeSuccess: boolean | null;
}

export interface ClientGameState {
  roomId: string;
  phase: GamePhase;
  myPlayer: Player;
  otherPlayers: PublicPlayer[];
  currentPlayerIndex: number;
  myPlayerIndex: number;
  direction: PlayDirection;
  directionChosen: boolean;
  topCard: Card;
  drawPileCount: number;
  activeColor: CardColor | null;
  pendingPenalty: number;
  hostId: string;
  hasDrawnThisTurn: boolean;
  lastPlayedCard: Card | null;
  challengeState: ChallengeState | null;
  lastDrawnCardId: string | null;
  winnerId: string | null;
  isDraw: boolean;
  eventLog: GameLogEntry[];
}

export function toClientGameState(state: GameState, playerId: string): ClientGameState {
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
      playerIndex: state.players.findIndex(item => item.id === p.id),
      handCount: p.hand.length,
      status: p.status,
      hasCalledUno: p.hasCalledUno,
      connected: p.connected,
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
    directionChosen: state.directionChosen,
    topCard,
    drawPileCount: state.drawPile.length,
    activeColor: state.activeColor,
    pendingPenalty: state.pendingPenalty,
    hostId: state.hostId,
    hasDrawnThisTurn: state.hasDrawnThisTurn,
    lastPlayedCard: state.lastPlayedCard,
    challengeState: state.challengeState,
    lastDrawnCardId: state.lastDrawnCardId,
    winnerId: state.winnerId,
    isDraw: state.isDraw,
    eventLog: state.eventLog,
  };
}

export function getNextPlayerIndex(
  currentIndex: number,
  direction: PlayDirection,
  totalPlayers: number
): number {
  return (currentIndex + direction + totalPlayers) % totalPlayers;
}

