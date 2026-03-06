/** Card color values. */
export type CardColor = 'Red' | 'Blue' | 'Green' | 'Yellow' | 'Wild';

/** Card face values. */
export type CardValue =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'Skip'
  | 'Reverse'
  | 'Draw2'
  | 'Wild'
  | 'WildDraw4';

/** Core card model shared by client and server. */
export interface Card {
  /** Unique card identifier generated when creating the deck. */
  id: string;
  /** Card color. */
  color: CardColor;
  /** Card face value. */
  value: CardValue;
}

/** Returns true if the card is wild. */
export function isWildCard(card: Card): boolean {
  return card.color === 'Wild';
}

/** Returns true if the card is a non-wild action card. */
export function isActionCard(card: Card): boolean {
  return ['Skip', 'Reverse', 'Draw2'].includes(card.value);
}

/** Returns true if the card is Draw 2. */
export function isDraw2Card(card: Card): boolean {
  return card.value === 'Draw2';
}

/** Returns true if the card is Wild Draw 4. */
export function isWildDraw4Card(card: Card): boolean {
  return card.value === 'WildDraw4';
}

/** Returns true if the card can be used to stack penalties. */
export function isStackableCard(card: Card): boolean {
  return isDraw2Card(card) || isWildDraw4Card(card);
}