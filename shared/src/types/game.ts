import type { Card, CardColor } from './card';
import type { Player, PublicPlayer } from './player';

/** 娓告垙闃舵 */
export type GamePhase =
  | 'waiting'     // 绛夊緟鐜╁鍔犲叆/鍑嗗
  | 'dealing'     // 鍙戠墝涓?  | 'playing'    // 娓告垙杩涜涓?  | 'challenge'  // +4 鎸戞垬闃舵
  | 'finished';  // 娓告垙缁撴潫

/** 鍑虹墝鏂瑰悜 */
export type PlayDirection = 1 | -1;  // 1: 椤烘椂閽? -1: 閫嗘椂閽?
/** 娓告垙鐘舵€侊紙鏈嶅姟鍣ㄥ畬鏁寸姸鎬侊級 */
export interface GameState {
  /** 鎴块棿 ID */
  roomId: string;
  /** 娓告垙闃舵 */
  phase: GamePhase;
  /** 鎵€鏈夌帺瀹?*/
  players: Player[];
  /** 褰撳墠鐜╁绱㈠紩 */
  currentPlayerIndex: number;
  /** 鍑虹墝鏂瑰悜 */
  direction: PlayDirection;
  /** 鏄惁宸茬敱搴勫閫夋嫨鏂瑰悜 */
  directionChosen: boolean;
  /** 鎶界墝鍫?*/
  drawPile: Card[];
  /** 寮冪墝鍫?*/
  discardPile: Card[];
  /** 褰撳墠鐢熸晥棰滆壊锛堜竾鑳界墝鎸囧畾鍚庯級 */
  activeColor: CardColor | null;
  /** 绱Н缃氱墝鏁帮紙+2/+4 鍙犲姞锛?*/
  pendingPenalty: number;
  /** 鎴夸富 ID */
  hostId: string;
  /** 褰撳墠鍥炲悎鏄惁宸叉娊鐗?*/
  hasDrawnThisTurn: boolean;
  /** 鏈€鍚庢墦鍑虹殑鐗?*/
  lastPlayedCard: Card | null;
  /** +4 鎸戞垬鐩稿叧 */
  challengeState: ChallengeState | null;
  /** 鏄惁宸插鐞嗛寮犵墝鐨勬晥鏋?*/
  initialEffectApplied: boolean;
  /** 鏈洖鍚堟娊鍒扮殑鐗岋紙鎶界墝鍚庡彧鑳藉嚭杩欏紶锛?*/
  lastDrawnCardId: string | null;
  /** 鑾疯儨鑰?ID */
  winnerId: string | null;
  reshuffleCount: number;
  isDraw: boolean;
}

/** +4 鎸戞垬鐘舵€?*/
export interface ChallengeState {
  /** 鍙戣捣 +4 鐨勭帺瀹剁储寮?*/
  challengerIndex: number;  // 琚綒鐨勭帺瀹讹紙涓嬪锛?  /** 鍑?+4 鐨勭帺瀹剁储寮?*/
  wildDraw4PlayerIndex: number;
  previousColor: CardColor;
  /** 鏄惁宸插畬鎴愭寫鎴?*/
  resolved: boolean;
  /** 鎸戞垬缁撴灉 */
  challengeSuccess: boolean | null;
}

/** 鐜╁鍙鐨勬父鎴忕姸鎬侊紙鍙戦€佺粰鍓嶇锛?*/
export interface ClientGameState {
  roomId: string;
  phase: GamePhase;
  /** 褰撳墠鐜╁鑷繁鐨勪俊鎭紙鍚墜鐗岃鎯咃級 */
  myPlayer: Player;
  /** 鍏朵粬鐜╁鐨勫叕寮€淇℃伅 */
  otherPlayers: PublicPlayer[];
  currentPlayerIndex: number;
  myPlayerIndex: number;
  direction: PlayDirection;
  directionChosen: boolean;
  /** 寮冪墝鍫嗛《閮ㄧ墝 */
  topCard: Card;
  /** 鎶界墝鍫嗗墿浣欐暟閲?*/
  drawPileCount: number;
  activeColor: CardColor | null;
  pendingPenalty: number;
  hostId: string;
  hasDrawnThisTurn: boolean;
  lastPlayedCard: Card | null;
  challengeState: ChallengeState | null;
  lastDrawnCardId: string | null;
  winnerId: string | null;
  isDraw: boolean;
}

/** 灏嗘湇鍔＄ GameState 杞崲涓哄鎴风鍙鐘舵€?*/
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
    isDraw: state.isDraw,
  };
}

/** 鑾峰彇涓嬩竴涓帺瀹剁储寮?*/
export function getNextPlayerIndex(
  currentIndex: number,
  direction: PlayDirection,
  totalPlayers: number
): number {
  return (currentIndex + direction + totalPlayers) % totalPlayers;
}

