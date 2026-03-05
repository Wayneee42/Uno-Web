import { describe, expect, it } from 'vitest';
import type { Player } from './player';
import { toPublicPlayer } from './player';

describe('player utils', () => {
  it('maps player to public player', () => {
    const player: Player = {
      id: 'p1',
      name: 'Alice',
      hand: [{ id: 'c1', color: 'Red', value: '1' }],
      status: 'playing',
      hasCalledUno: false,
      socketId: 'sock-1',
    };

    const result = toPublicPlayer(player, 2);

    expect(result).toEqual({
      id: 'p1',
      name: 'Alice',
      playerIndex: 2,
      handCount: 1,
      status: 'playing',
      hasCalledUno: false,
    });
  });
});
