import type { Card } from './card.js';

export type PlayerStatus = 'waiting' | 'ready' | 'playing' | 'finished';

export interface Player {
  id: string;
  profileId: string | null;
  sessionId: string;
  name: string;
  hand: Card[];
  status: PlayerStatus;
  hasCalledUno: boolean;
  socketId: string;
  connected: boolean;
}

export interface ClientPlayer extends PublicPlayer {
  hand: Card[];
}

export interface PublicPlayer {
  id: string;
  name: string;
  playerIndex: number;
  handCount: number;
  status: PlayerStatus;
  hasCalledUno: boolean;
  connected: boolean;
}

export function toPublicPlayer(player: Player, playerIndex: number): PublicPlayer {
  return {
    id: player.id,
    name: player.name,
    playerIndex,
    handCount: player.hand.length,
    status: player.status,
    hasCalledUno: player.hasCalledUno,
    connected: player.connected,
  };
}

export function toClientPlayer(player: Player, playerIndex: number): ClientPlayer {
  return {
    ...toPublicPlayer(player, playerIndex),
    hand: player.hand,
  };
}

