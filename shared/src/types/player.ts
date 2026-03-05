import type { Card } from './card';

/** 玩家状态 */
export type PlayerStatus = 'waiting' | 'ready' | 'playing' | 'finished';

/** 玩家接口 */
export interface Player {
  /** 玩家唯一 ID */
  id: string;
  /** 玩家昵称 */
  name: string;
  /** 玩家手牌 */
  hand: Card[];
  /** 玩家状态 */
  status: PlayerStatus;
  /** 是否已喊 UNO */
  hasCalledUno: boolean;
  /** 连接的 socket ID */
  socketId: string;
}

/** 玩家公开信息（发送给其他玩家） */
export interface PublicPlayer {
  id: string;
  name: string;
  playerIndex: number;
  handCount: number;
  status: PlayerStatus;
  hasCalledUno: boolean;
}

/** 将 Player 转换为 PublicPlayer */
export function toPublicPlayer(player: Player, playerIndex: number): PublicPlayer {
  return {
    id: player.id,
    name: player.name,
    playerIndex,
    handCount: player.hand.length,
    status: player.status,
    hasCalledUno: player.hasCalledUno,
  };
}
