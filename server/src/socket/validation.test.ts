import { describe, expect, it } from 'vitest';
import {
  parseCardColor,
  parseDirection,
  parsePlayerName,
  parseRoomId,
  parseSessionId,
} from './validation.js';

describe('socket payload validation', () => {
  it('normalizes safe lobby values and rejects malformed ones', () => {
    expect(parsePlayerName('  Alice   Smith ')).toBe('Alice Smith');
    expect(parsePlayerName('')).toBeNull();
    expect(parsePlayerName('Alice\nAdmin')).toBeNull();
    expect(parseRoomId(' ab12cd ')).toBe('AB12CD');
    expect(parseRoomId('DROP TABLE')).toBeNull();
  });

  it('accepts only protocol enum values and valid session tokens', () => {
    expect(parseDirection(-1)).toBe(-1);
    expect(parseDirection(0)).toBeNull();
    expect(parseCardColor('Red')).toBe('Red');
    expect(parseCardColor('Purple')).toBeUndefined();
    expect(parseSessionId(`session_${'a'.repeat(24)}`)).toBeTruthy();
    expect(parseSessionId('short')).toBeNull();
  });
});
