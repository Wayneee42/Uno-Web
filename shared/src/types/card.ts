/** 卡牌颜色 */
export type CardColor = 'Red' | 'Blue' | 'Green' | 'Yellow' | 'Wild';

/** 卡牌值 */
export type CardValue =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'Skip'
  | 'Reverse'
  | 'Draw2'
  | 'Wild'
  | 'WildDraw4';

/** 卡牌接口 */
export interface Card {
  /** 唯一标识符，洗牌时生成 */
  id: string;
  /** 卡牌颜色 */
  color: CardColor;
  /** 卡牌值 */
  value: CardValue;
}

/** 判断卡牌是否为万能牌 */
export function isWildCard(card: Card): boolean {
  return card.color === 'Wild';
}

/** 判断卡牌是否为功能牌 */
export function isActionCard(card: Card): boolean {
  return ['Skip', 'Reverse', 'Draw2'].includes(card.value);
}

/** 判断卡牌是否为 +2 牌 */
export function isDraw2Card(card: Card): boolean {
  return card.value === 'Draw2';
}

/** 判断卡牌是否为 +4 牌 */
export function isWildDraw4Card(card: Card): boolean {
  return card.value === 'WildDraw4';
}

/** 判断卡牌是否为叠加牌 (+2 或 +4) */
export function isStackableCard(card: Card): boolean {
  return isDraw2Card(card) || isWildDraw4Card(card);
}
