import { describe, expect, it } from 'vitest';
import type { Card, GameState, Player } from '@uno-web/shared';
import { GameManager } from './GameManager.js';
import { createDeck } from './DeckManager.js';

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

  it('does not add a forgotten UNO penalty when turns advance', () => {
    const manager = new GameManager();
    const drawCard: Card = { id: 'draw-1', color: 'Blue', value: '3' };
    const state: GameState = {
      roomId: 'room-2',
      phase: 'playing',
      players: [
        {
          id: 'p1',
          sessionId: 's1',
          name: 'Alice',
          hand: [{ id: 'c1', color: 'Red', value: '5' }],
          status: 'playing',
          hasCalledUno: false,
          socketId: 'sock-1',
          connected: true,
        },
        {
          id: 'p2',
          sessionId: 's2',
          name: 'Bob',
          hand: [{ id: 'c2', color: 'Green', value: '7' }, { id: 'c3', color: 'Yellow', value: '1' }],
          status: 'playing',
          hasCalledUno: false,
          socketId: 'sock-2',
          connected: true,
        },
      ],
      currentPlayerIndex: 0,
      direction: 1,
      directionChosen: true,
      drawPile: [drawCard],
      discardPile: [{ id: 'top', color: 'Blue', value: '9' }],
      activeColor: null,
      pendingPenalty: 0,
      hostId: 'p1',
      hasDrawnThisTurn: false,
      lastPlayedCard: null,
      challengeState: null,
      initialEffectApplied: true,
      lastDrawnCardId: null,
      winnerId: null,
      isDraw: false,
      reshuffleCount: 0,
      eventLog: [],
    };

    (manager as unknown as { advanceTurn: (game: GameState) => void }).advanceTurn(state);

    expect(state.currentPlayerIndex).toBe(1);
    expect(state.players[0].hand).toHaveLength(1);
    expect(state.drawPile).toHaveLength(1);
    expect(state.eventLog.some(entry => entry.message.includes('forgot UNO'))).toBe(false);
  });
});
