import { describe, expect, it } from 'vitest';
import {
  isActionCard,
  isDraw2Card,
  isStackableCard,
  isWildCard,
  isWildDraw4Card,
} from './card';

const base = { id: 'c1', color: 'Red', value: '1' } as const;

describe('card utils', () => {
  it('detects wild cards', () => {
    expect(isWildCard({ ...base, color: 'Wild', value: 'Wild' })).toBe(true);
    expect(isWildCard(base)).toBe(false);
  });

  it('detects action cards', () => {
    expect(isActionCard({ ...base, value: 'Skip' })).toBe(true);
    expect(isActionCard({ ...base, value: 'Reverse' })).toBe(true);
    expect(isActionCard({ ...base, value: 'Draw2' })).toBe(true);
    expect(isActionCard(base)).toBe(false);
  });

  it('detects draw cards and stackable cards', () => {
    expect(isDraw2Card({ ...base, value: 'Draw2' })).toBe(true);
    expect(isWildDraw4Card({ ...base, color: 'Wild', value: 'WildDraw4' })).toBe(true);
    expect(isStackableCard({ ...base, value: 'Draw2' })).toBe(true);
    expect(isStackableCard({ ...base, color: 'Wild', value: 'WildDraw4' })).toBe(true);
    expect(isStackableCard(base)).toBe(false);
  });
});
