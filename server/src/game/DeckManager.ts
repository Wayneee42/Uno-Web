import type { Card, CardColor, CardValue } from '@uno-web/shared';

const COLORS: CardColor[] = ['Red', 'Blue', 'Green', 'Yellow'];
const NUMBER_VALUES: CardValue[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const ACTION_VALUES: CardValue[] = ['Skip', 'Reverse', 'Draw2'];
const WILD_VALUES: CardValue[] = ['Wild', 'WildDraw4'];

let cardIdCounter = 0;

function generateCardId(): string {
  return `card-${++cardIdCounter}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function createCard(color: CardColor, value: CardValue): Card {
  return {
    id: generateCardId(),
    color,
    value,
  };
}

export function createDeck(): Card[] {
  const deck: Card[] = [];

  for (const color of COLORS) {
    for (let i = 0; i < 2; i++) {
      for (const value of NUMBER_VALUES) {
        deck.push(createCard(color, value));
      }

      for (const value of ACTION_VALUES) {
        deck.push(createCard(color, value));
      }
    }
  }

  for (let i = 0; i < 4; i++) {
    for (const value of WILD_VALUES) {
      deck.push(createCard('Wild', value));
    }
  }

  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function canPlayCard(handCard: Card, topCard: Card, activeColor: CardColor | null): boolean {
  if (handCard.color === 'Wild') {
    return true;
  }

  const effectiveColor = activeColor || topCard.color;

  if (handCard.color === effectiveColor) {
    return true;
  }

  if (handCard.value === topCard.value && topCard.color !== 'Wild') {
    return true;
  }

  return false;
}

export function hasPlayableCard(hand: Card[], topCard: Card, activeColor: CardColor | null): boolean {
  return hand.some(card => canPlayCard(card, topCard, activeColor));
}

export function getCardScore(card: Card): number {
  if (card.color === 'Wild') {
    return card.value === 'WildDraw4' ? 50 : 40;
  }

  switch (card.value) {
    case 'Skip':
    case 'Reverse':
    case 'Draw2':
      return 20;
    default:
      return parseInt(card.value, 10) || 0;
  }
}

export function getHighestCardValue(hand: Card[]): number {
  let highest = 0;
  for (const card of hand) {
    const score = getCardScore(card);
    if (card.color !== 'Wild') {
      if (score > highest) {
        highest = score;
      }
    }
  }
  return highest;
}
