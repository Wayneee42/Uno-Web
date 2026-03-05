import type { Card, CardColor } from './card';
import type { Player, PublicPlayer } from './player';

/** 游戏阶段 */
export type GamePhase =
  | 'waiting'     // 等待玩家加入/准备
  | 'dealing'     // 发牌中
  | 'playing'    // 游戏进行中
  | 'challenge'  // +4 挑战阶段
  | 'finished';  // 游戏结束

/** 出牌方向 */
export type PlayDirection = 1 | -1;  // 1: 顺时针, -1: 逆时针

/** 游戏状态（服务器完整状态） */
export interface GameState {
  /** 房间 ID */
  roomId: string;
  /** 游戏阶段 */
  phase: GamePhase;
  /** 所有玩家 */
  players: Player[];
  /** 当前玩家索引 */
  currentPlayerIndex: number;
  /** 出牌方向 */
  direction: PlayDirection;
  /** 是否已由庄家选择方向 */
  directionChosen: boolean;
  /** 抽牌堆 */
  drawPile: Card[];
  /** 弃牌堆 */
  discardPile: Card[];
  /** 当前生效颜色（万能牌指定后） */
  activeColor: CardColor | null;
  /** 累积罚牌数（+2/+4 叠加） */
  pendingPenalty: number;
  /** 房主 ID */
  hostId: string;
  /** 当前回合是否已抽牌 */
  hasDrawnThisTurn: boolean;
  /** 最后打出的牌 */
  lastPlayedCard: Card | null;
  /** +4 挑战相关 */
  challengeState: ChallengeState | null;
  /** 是否已处理首张牌的效果 */
  initialEffectApplied: boolean;
  /** 本回合抽到的牌（抽牌后只能出这张） */
  lastDrawnCardId: string | null;
  /** 获胜者 ID */
  winnerId: string | null;
}

/** +4 挑战状态 */
export interface ChallengeState {
  /** 发起 +4 的玩家索引 */
  challengerIndex: number;  // 被罚的玩家（下家）
  /** 出 +4 的玩家索引 */
  wildDraw4PlayerIndex: number;
  previousColor: CardColor;
  /** 是否已完成挑战 */
  resolved: boolean;
  /** 挑战结果 */
  challengeSuccess: boolean | null;
}

/** 玩家可见的游戏状态（发送给前端） */
export interface ClientGameState {
  roomId: string;
  phase: GamePhase;
  /** 当前玩家自己的信息（含手牌详情） */
  myPlayer: Player;
  /** 其他玩家的公开信息 */
  otherPlayers: PublicPlayer[];
  currentPlayerIndex: number;
  myPlayerIndex: number;
  direction: PlayDirection;
  directionChosen: boolean;
  /** 弃牌堆顶部牌 */
  topCard: Card;
  /** 抽牌堆剩余数量 */
  drawPileCount: number;
  activeColor: CardColor | null;
  pendingPenalty: number;
  hostId: string;
  hasDrawnThisTurn: boolean;
  lastPlayedCard: Card | null;
  challengeState: ChallengeState | null;
  lastDrawnCardId: string | null;
  winnerId: string | null;
}

/** 将服务端 GameState 转换为客户端可见状态 */
export function toClientGameState(
  state: GameState,
  playerId: string
): ClientGameState {
  const myPlayerIndex = state.players.findIndex(p => p.id === playerId);
  if (myPlayerIndex === -1) {
    throw new Error(`Player ${playerId} not found in game`);
  }

  const myPlayer = state.players[myPlayerIndex];
  const otherPlayers = state.players
    .filter((_, index) => index !== myPlayerIndex)
    .map(p => ({
      id: p.id,
      name: p.name,
      playerIndex: state.players.findIndex(item => item.id === p.id),
      handCount: p.hand.length,
      status: p.status,
      hasCalledUno: p.hasCalledUno,
    }));

  const topCard = state.discardPile[state.discardPile.length - 1];

  return {
    roomId: state.roomId,
    phase: state.phase,
    myPlayer,
    otherPlayers,
    currentPlayerIndex: state.currentPlayerIndex,
    myPlayerIndex,
    direction: state.direction,
    directionChosen: state.directionChosen,
    topCard,
    drawPileCount: state.drawPile.length,
    activeColor: state.activeColor,
    pendingPenalty: state.pendingPenalty,
    hostId: state.hostId,
    hasDrawnThisTurn: state.hasDrawnThisTurn,
    lastPlayedCard: state.lastPlayedCard,
    challengeState: state.challengeState,
    lastDrawnCardId: state.lastDrawnCardId,
    winnerId: state.winnerId,
  };
}

/** 获取下一个玩家索引 */
export function getNextPlayerIndex(
  currentIndex: number,
  direction: PlayDirection,
  totalPlayers: number
): number {
  return (currentIndex + direction + totalPlayers) % totalPlayers;
}
