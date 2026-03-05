import { describe, expect, it, vi } from 'vitest';
import type { Player, GameState, Card } from '@uno-web/shared';
import { GameManager } from './GameManager';
import { canPlayCard } from './DeckManager';

function seedRandom(seed = 42) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    hand: [],
    status: 'waiting',
    hasCalledUno: false,
    socketId: `s${index + 1}`,
  }));
}

function getCurrentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex];
}

function findPlayableCard(state: GameState, player: Player): Card | null {
  const topCard = state.discardPile[state.discardPile.length - 1];
  if (state.pendingPenalty > 0) {
    return player.hand.find(card => card.value === 'Draw2' || card.value === 'WildDraw4') ?? null;
  }
  return player.hand.find(card => canPlayCard(card, topCard, state.activeColor)) ?? null;
}

function chooseWildColor(hand: Card[]): 'Red' | 'Blue' | 'Green' | 'Yellow' {
  const counts = new Map<'Red' | 'Blue' | 'Green' | 'Yellow', number>([
    ['Red', 0],
    ['Blue', 0],
    ['Green', 0],
    ['Yellow', 0],
  ]);

  for (const card of hand) {
    if (card.color === 'Red' || card.color === 'Blue' || card.color === 'Green' || card.color === 'Yellow') {
      counts.set(card.color, (counts.get(card.color) ?? 0) + 1);
    }
  }

  let best: 'Red' | 'Blue' | 'Green' | 'Yellow' = 'Red';
  let max = -1;
  for (const [color, count] of counts.entries()) {
    if (count > max) {
      max = count;
      best = color;
    }
  }

  return best;
}

function simulateTurn(manager: GameManager, state: GameState): void {
  if (state.phase === 'finished') return;

  if (!state.directionChosen) {
    const dealer = getCurrentPlayer(state);
    const result = manager.chooseDirection(state, dealer.id, 1);
    expect(result.success).toBe(true);
  }

  if (state.challengeState && !state.challengeState.resolved) {
    const challenger = state.players[state.challengeState.challengerIndex];
    const result = manager.handleChallenge(state, challenger.id, false);
    expect(result.success).toBe(true);
    return;
  }

  const current = getCurrentPlayer(state);
  if (current.hand.length === 1 && !current.hasCalledUno) {
    const unoResult = manager.callUno(state, current.id);
    expect(unoResult.success).toBe(true);
  }
  const playable = findPlayableCard(state, current);

  if (playable) {
    const chosenColor = playable.color === 'Wild' ? chooseWildColor(current.hand) : undefined;
    const result = manager.playCard(state, current.id, playable.id, chosenColor);
    expect(result.success).toBe(true);
    return;
  }

  const drawResult = manager.drawCard(state, current.id);
  expect(drawResult.success).toBe(true);

  if (state.phase === 'finished') return;

  if (state.hasDrawnThisTurn && state.lastDrawnCardId) {
    const drawnCard = current.hand.find(card => card.id === state.lastDrawnCardId) ?? null;
    const topCard = state.discardPile[state.discardPile.length - 1];
    if (drawnCard && canPlayCard(drawnCard, topCard, state.activeColor)) {
      const chosenColor = drawnCard.color === 'Wild' ? chooseWildColor(current.hand) : undefined;
      const playResult = manager.playCard(state, current.id, drawnCard.id, chosenColor);
      expect(playResult.success).toBe(true);
      return;
    }

    const endResult = manager.endTurn(state, current.id);
    expect(endResult.success).toBe(true);
  }
}

describe('Game simulation', () => {
  it('can simulate multiple games with randomized play', () => {
    const random = seedRandom(123);
    const randomSpy = vi.spyOn(Math, 'random').mockImplementation(random);

    try {
      for (let gameIndex = 0; gameIndex < 3; gameIndex += 1) {
        const manager = new GameManager();
        const players = makePlayers(4);
        const state = manager.createGame(`room-${gameIndex}`, players, players[0].id);
        const deckSize = state.drawPile.length + state.discardPile.length + state.players.reduce((sum, player) => sum + player.hand.length, 0);

        let safety = 0;
        const maxTurns = 5000;
        while (state.phase !== 'finished' && safety < maxTurns) {
          simulateTurn(manager, state);
          safety += 1;
        }

        if (state.phase !== 'finished') {
          throw new Error(
            `Simulation did not finish after ${maxTurns} turns (room ${state.roomId}).`
          );
        }
        if (state.isDraw) {
          expect(state.winnerId).toBeNull();
        } else {
          expect(state.winnerId).toBeTruthy();
        }
      }
    } finally {
      randomSpy.mockRestore();
    }
  });
});
