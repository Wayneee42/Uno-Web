import type { CardColor, PlayDirection } from '@uno-web/shared';

const ROOM_ID_PATTERN = /^[A-Z0-9]{6}$/;
const SESSION_ID_PATTERN = /^session_[A-Za-z0-9_-]{20,64}$/;
const MATCH_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CARD_COLORS = new Set<CardColor>(['Red', 'Blue', 'Green', 'Yellow', 'Wild']);

export function parsePlayerName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 20) return null;
  return name;
}

export function parseRoomId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const roomId = value.trim().toUpperCase();
  return ROOM_ID_PATTERN.test(roomId) ? roomId : null;
}

export function parseSessionId(value: unknown): string | null {
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value) ? value : null;
}

export function parseMatchId(value: unknown): string | null {
  return typeof value === 'string' && MATCH_ID_PATTERN.test(value) ? value : null;
}

export function parseCardId(value: unknown): string | null {
  return typeof value === 'string' && value.length >= 1 && value.length <= 80 ? value : null;
}

export function parseCardColor(value: unknown): CardColor | undefined {
  return typeof value === 'string' && CARD_COLORS.has(value as CardColor)
    ? value as CardColor
    : undefined;
}

export function parseDirection(value: unknown): PlayDirection | null {
  return value === 1 || value === -1 ? value : null;
}

export function parseBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export function parseHistoryLimit(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value)
    ? Math.max(1, Math.min(50, value))
    : 20;
}

export function parseCursor(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= 256 ? value : undefined;
}
