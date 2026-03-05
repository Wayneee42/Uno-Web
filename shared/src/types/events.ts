import type { Card, CardColor } from './card';
import type { ClientGameState, PlayDirection } from './game';

// ============= Client -> Server Events =============

/** Create room payload */
export interface CreateRoomPayload {
  playerName: string;
}

/** Join room payload */
export interface JoinRoomPayload {
  roomId: string;
  playerName: string;
}

/** Ready payload */
export interface ReadyPayload {
  ready: boolean;
}

/** Play card payload */
export interface PlayCardPayload {
  cardId: string;
  chosenColor?: CardColor;
}

/** Draw card payload */
export interface DrawCardPayload {
  // No extra params needed
}

/** Call UNO payload */
export interface CallUnoPayload {
  // No extra params needed
}

/** Challenge payload */
export interface ChallengePayload {
  challenge: boolean;
}

/** Start game payload */
export interface StartGamePayload {
  // No extra params needed
}

/** End turn payload */
export interface EndTurnPayload {
  // No extra params needed
}

/** Choose direction payload */
export interface ChooseDirectionPayload {
  direction: PlayDirection;
}

// ============= Server -> Client Events =============

/** Error response */
export interface ErrorPayload {
  message: string;
  code: string;
}

/** Room info */
export interface RoomInfo {
  roomId: string;
  players: Array<{
    id: string;
    name: string;
    isReady: boolean;
    isHost: boolean;
  }>;
  minPlayers: number;
  maxPlayers: number;
  canStart: boolean;
}

/** Socket event type map - Client to Server */
export interface ClientToServerEvents {
  createRoom: (payload: CreateRoomPayload, callback: (room: RoomInfo) => void) => void;
  joinRoom: (payload: JoinRoomPayload, callback: (response: { success: boolean; room?: RoomInfo; error?: string }) => void) => void;
  leaveRoom: (callback: () => void) => void;
  ready: (payload: ReadyPayload) => void;
  startGame: (payload: StartGamePayload, callback: (response: { success: boolean; error?: string }) => void) => void;
  playCard: (payload: PlayCardPayload, callback: (response: { success: boolean; error?: string }) => void) => void;
  drawCard: (payload: DrawCardPayload, callback: (response: { success: boolean; error?: string }) => void) => void;
  endTurn: (payload: EndTurnPayload, callback: (response: { success: boolean; error?: string }) => void) => void;
  chooseDirection: (payload: ChooseDirectionPayload, callback: (response: { success: boolean; error?: string }) => void) => void;
  callUno: (payload: CallUnoPayload) => void;
  challenge: (payload: ChallengePayload, callback: (response: { success: boolean; error?: string }) => void) => void;
}

export interface ServerToClientEvents {
  roomUpdate: (room: RoomInfo) => void;
  gameStart: () => void;
  gameStateUpdate: (state: ClientGameState) => void;
  error: (payload: ErrorPayload) => void;
  playerJoined: (player: { id: string; name: string }) => void;
  playerLeft: (playerId: string) => void;
}

/** Socket event name constants */
export const SOCKET_EVENTS = {
  CREATE_ROOM: 'createRoom',
  JOIN_ROOM: 'joinRoom',
  LEAVE_ROOM: 'leaveRoom',
  READY: 'ready',
  START_GAME: 'startGame',
  PLAY_CARD: 'playCard',
  DRAW_CARD: 'drawCard',
  END_TURN: 'endTurn',
  CHOOSE_DIRECTION: 'chooseDirection',
  CALL_UNO: 'callUno',
  CHALLENGE: 'challenge',
  ROOM_UPDATE: 'roomUpdate',
  GAME_START: 'gameStart',
  GAME_STATE_UPDATE: 'gameStateUpdate',
  ERROR: 'error',
  PLAYER_JOINED: 'playerJoined',
  PLAYER_LEFT: 'playerLeft',
} as const;
