import { describe, expect, it } from 'vitest';
import { GameManager } from './GameManager';
import { createDeck } from './DeckManager';
import type { Player } from '@uno-web/shared';

describe('GameManager', () => {
  it('creates a game with dealt hands and a non-wild top card', () => {
    const manager = new GameManager();
    const players: Player[] = [
      { id: 'p1', sessionId: 's1', name: 'Alice', hand: [], status: 'waiting', hasCalledUno: false, socketId: 'sock-1', connected: true },
      { id: 'p2', sessionId: 's2', name: 'Bob', hand: [], status: 'waiting', hasCalledUno: false, socketId: 'sock-2', connected: true },
      { id: 'p3', sessionId: 's3', name: 'Cara', hand: [], status: 'waiting', hasCalledUno: false, socketId: 'sock-3', connected: true },
    ];

    const state = manager.createGame('room-1', players, 'p1');
    const totalHandCards = state.players.reduce((sum, player) => sum + player.hand.length, 0);

    expect(state.players.every(player => player.hand.length === 7)).toBe(true);
    expect(state.discardPile).toHaveLength(1);
    expect(state.discardPile[0].color).not.toBe('Wild');
    expect(state.isDraw).toBe(false);

    const deckSize = createDeck().length;
    expect(totalHandCards + state.drawPile.length + state.discardPile.length).toBe(deckSize);
  });
});
