import { describe, expect, it } from 'vitest';
import { canPlayCard, createDeck, shuffleDeck } from './DeckManager';

const topCard = { id: 't1', color: 'Red', value: '5' };

describe('DeckManager', () => {
  it('creates a full deck', () => {
    const deck = createDeck();
    expect(deck.length).toBe(112);
  });

  it('shuffles without changing length', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    expect(shuffled.length).toBe(deck.length);
  });

  it('validates playable cards', () => {
    expect(canPlayCard({ id: 'c1', color: 'Red', value: '2' }, topCard, null)).toBe(true);
    expect(canPlayCard({ id: 'c2', color: 'Blue', value: '5' }, topCard, null)).toBe(true);
    expect(canPlayCard({ id: 'c3', color: 'Blue', value: '7' }, topCard, null)).toBe(false);
    expect(canPlayCard({ id: 'c4', color: 'Wild', value: 'Wild' }, topCard, null)).toBe(true);
  });
});
