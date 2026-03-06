import { describe, expect, it } from 'vitest';
import type { Player } from '@uno-web/shared';
import { toClientGameState } from '@uno-web/shared';
import { GameManager } from './GameManager';

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    sessionId: `session-${index + 1}`,
    name: `Player ${index + 1}`,
    hand: [],
    status: 'waiting',
    hasCalledUno: false,
    socketId: `sock-${index + 1}`,
    connected: true,
  }));
}

describe('Cross-module compatibility', () => {
  it('shared toClientGameState can consume server GameState', () => {
    const manager = new GameManager();
    const players = makePlayers(3);
    const state = manager.createGame('room-cross', players, players[0].id);

    const clientState = toClientGameState(state, players[0].id);
    expect(clientState.roomId).toBe('room-cross');
    expect(clientState.myPlayer.id).toBe(players[0].id);
    expect(clientState.otherPlayers).toHaveLength(2);
    expect(clientState.topCard).toBeTruthy();
    expect(clientState.isDraw).toBe(false);
  });
});
