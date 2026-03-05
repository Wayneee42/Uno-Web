import { describe, expect, it } from 'vitest';
import type { GameState } from './game';
import { getNextPlayerIndex, toClientGameState } from './game';

const baseState: GameState = {
  roomId: 'ROOM1',
  phase: 'playing',
  players: [
    {
      id: 'p1',
      name: 'Alice',
      hand: [{ id: 'c1', color: 'Red', value: '1' }],
      status: 'playing',
      hasCalledUno: false,
      socketId: 'sock-1',
    },
    {
      id: 'p2',
      name: 'Bob',
      hand: [{ id: 'c2', color: 'Blue', value: '2' }],
      status: 'playing',
      hasCalledUno: false,
      socketId: 'sock-2',
    },
  ],
  currentPlayerIndex: 0,
  direction: 1,
  directionChosen: true,
  drawPile: [],
  discardPile: [{ id: 'c3', color: 'Green', value: '3' }],
  activeColor: null,
  pendingPenalty: 0,
  hostId: 'p1',
  hasDrawnThisTurn: false,
  lastPlayedCard: null,
  challengeState: null,
  initialEffectApplied: true,
  lastDrawnCardId: null,
  winnerId: null,
  reshuffleCount: 0,
  isDraw: false,
};

describe('game utils', () => {
  it('computes next player index', () => {
    expect(getNextPlayerIndex(0, 1, 4)).toBe(1);
    expect(getNextPlayerIndex(0, -1, 4)).toBe(3);
  });

  it('maps game state to client state', () => {
    const clientState = toClientGameState(baseState, 'p1');
    expect(clientState.myPlayer.id).toBe('p1');
    expect(clientState.otherPlayers).toHaveLength(1);
    expect(clientState.topCard.value).toBe('3');
  });
});
