import type { CardColor } from './card.js';
import type { ClientGameState, PlayDirection } from './game.js';
import type {
  MatchDetails,
  MatchHistoryPage,
  PlayerProfile,
  ProfileStats,
} from './history.js';

export interface CreateRoomPayload {
  playerName: string;
}

export interface JoinRoomPayload {
  roomId: string;
  playerName: string;
}

export interface ResumeSessionPayload {
  sessionId: string;
}

export interface InitializeProfilePayload {
  recoveryCode?: string;
}

export interface InitializeProfileResponse {
  success: boolean;
  profile?: PlayerProfile;
  recoveryCode?: string;
  historyAvailable: boolean;
  error?: string;
}

export interface RotateRecoveryCodeResponse {
  success: boolean;
  recoveryCode?: string;
  error?: string;
}

export interface MatchHistoryPayload {
  cursor?: string;
  limit?: number;
}

export interface MatchHistoryResponse {
  success: boolean;
  page?: MatchHistoryPage;
  historyAvailable: boolean;
  error?: string;
}

export interface MatchDetailsPayload {
  matchId: string;
}

export interface MatchDetailsResponse {
  success: boolean;
  match?: MatchDetails;
  historyAvailable: boolean;
  error?: string;
}

export interface ProfileStatsResponse {
  success: boolean;
  stats?: ProfileStats;
  historyAvailable: boolean;
  error?: string;
}

export interface ReadyPayload {
  ready: boolean;
}

export interface PlayCardPayload {
  cardId: string;
  chosenColor?: CardColor;
}

export interface DrawCardPayload {}

export interface CallUnoPayload {}

export interface ChallengePayload {
  challenge: boolean;
}

export interface StartGamePayload {}

export interface EndTurnPayload {}

export interface ChooseDirectionPayload {
  direction: PlayDirection;
}

export interface ReturnToLobbyPayload {}

export interface PlayAgainPayload {}

export interface GameEndPayload {
  reason?: string;
}

export interface ErrorPayload {
  message: string;
  code: string;
}

export const ERROR_CODES = {
  CREATE_ROOM_FAILED: 'CREATE_ROOM_FAILED',
  JOIN_ROOM_FAILED: 'JOIN_ROOM_FAILED',
  RESUME_SESSION_FAILED: 'RESUME_SESSION_FAILED',
  START_GAME_FAILED: 'START_GAME_FAILED',
  RETURN_TO_LOBBY_FAILED: 'RETURN_TO_LOBBY_FAILED',
  PLAY_AGAIN_FAILED: 'PLAY_AGAIN_FAILED',
  CHOOSE_DIRECTION_FAILED: 'CHOOSE_DIRECTION_FAILED',
  PLAY_CARD_FAILED: 'PLAY_CARD_FAILED',
  DRAW_CARD_FAILED: 'DRAW_CARD_FAILED',
  END_TURN_FAILED: 'END_TURN_FAILED',
  CALL_UNO_FAILED: 'CALL_UNO_FAILED',
  CHALLENGE_FAILED: 'CHALLENGE_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  PROFILE_FAILED: 'PROFILE_FAILED',
  HISTORY_FAILED: 'HISTORY_FAILED',
  SESSION_REPLACED: 'SESSION_REPLACED',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

export interface RoomInfo {
  roomId: string;
  players: Array<{
    id: string;
    name: string;
    isReady: boolean;
    isHost: boolean;
    connected: boolean;
  }>;
  minPlayers: number;
  maxPlayers: number;
  canStart: boolean;
}

export interface PlayerPresencePayload {
  playerId: string;
  name: string;
}

export interface PlayerDisconnectedPayload extends PlayerPresencePayload {
  graceMs: number;
  expiresAt: number;
}

export interface CreateRoomResponse {
  success: boolean;
  room?: RoomInfo;
  playerId?: string;
  sessionId?: string;
  error?: string;
}

export interface JoinRoomResponse {
  success: boolean;
  room?: RoomInfo;
  error?: string;
  playerId?: string;
  sessionId?: string;
}

export interface ResumeSessionResponse {
  success: boolean;
  room?: RoomInfo;
  gameState?: ClientGameState;
  playerId?: string;
  sessionId?: string;
  error?: string;
}

export interface ActionResponse {
  success: boolean;
  error?: string;
}

type ActionCallback = (response: ActionResponse) => void;

export interface ClientToServerEvents {
  initializeProfile: (
    payload: InitializeProfilePayload,
    callback: (response: InitializeProfileResponse) => void,
  ) => void;
  rotateRecoveryCode: (
    payload: Record<string, never>,
    callback: (response: RotateRecoveryCodeResponse) => void,
  ) => void;
  getMatchHistory: (
    payload: MatchHistoryPayload,
    callback: (response: MatchHistoryResponse) => void,
  ) => void;
  getMatchDetails: (
    payload: MatchDetailsPayload,
    callback: (response: MatchDetailsResponse) => void,
  ) => void;
  getProfileStats: (
    payload: Record<string, never>,
    callback: (response: ProfileStatsResponse) => void,
  ) => void;
  createRoom: (
    payload: CreateRoomPayload,
    callback: (response: CreateRoomResponse) => void,
  ) => void;
  joinRoom: (
    payload: JoinRoomPayload,
    callback: (response: JoinRoomResponse) => void,
  ) => void;
  resumeSession: (
    payload: ResumeSessionPayload,
    callback: (response: ResumeSessionResponse) => void,
  ) => void;
  leaveRoom: (callback: () => void) => void;
  ready: (payload: ReadyPayload) => void;
  startGame: (payload: StartGamePayload, callback: ActionCallback) => void;
  playAgain: (payload: PlayAgainPayload, callback: ActionCallback) => void;
  playCard: (payload: PlayCardPayload, callback: ActionCallback) => void;
  drawCard: (payload: DrawCardPayload, callback: ActionCallback) => void;
  endTurn: (payload: EndTurnPayload, callback: ActionCallback) => void;
  chooseDirection: (payload: ChooseDirectionPayload, callback: ActionCallback) => void;
  callUno: (payload: CallUnoPayload) => void;
  challenge: (payload: ChallengePayload, callback: ActionCallback) => void;
  returnToLobby: (payload: ReturnToLobbyPayload, callback: ActionCallback) => void;
}

export interface ServerToClientEvents {
  roomUpdate: (room: RoomInfo) => void;
  gameStart: () => void;
  gameEnd: (payload: GameEndPayload) => void;
  gameStateUpdate: (state: ClientGameState) => void;
  error: (payload: ErrorPayload) => void;
  playerJoined: (player: PlayerPresencePayload) => void;
  playerLeft: (playerId: string) => void;
  playerDisconnected: (player: PlayerDisconnectedPayload) => void;
  playerReconnected: (player: PlayerPresencePayload) => void;
  profileCredentialsRevoked: () => void;
  sessionReplaced: () => void;
  serverRestarting: () => void;
}

export const SOCKET_EVENTS = {
  INITIALIZE_PROFILE: 'initializeProfile',
  ROTATE_RECOVERY_CODE: 'rotateRecoveryCode',
  GET_MATCH_HISTORY: 'getMatchHistory',
  GET_MATCH_DETAILS: 'getMatchDetails',
  GET_PROFILE_STATS: 'getProfileStats',
  CREATE_ROOM: 'createRoom',
  JOIN_ROOM: 'joinRoom',
  RESUME_SESSION: 'resumeSession',
  LEAVE_ROOM: 'leaveRoom',
  READY: 'ready',
  START_GAME: 'startGame',
  PLAY_AGAIN: 'playAgain',
  PLAY_CARD: 'playCard',
  DRAW_CARD: 'drawCard',
  END_TURN: 'endTurn',
  CHOOSE_DIRECTION: 'chooseDirection',
  CALL_UNO: 'callUno',
  CHALLENGE: 'challenge',
  RETURN_TO_LOBBY: 'returnToLobby',
  ROOM_UPDATE: 'roomUpdate',
  GAME_START: 'gameStart',
  GAME_END: 'gameEnd',
  GAME_STATE_UPDATE: 'gameStateUpdate',
  ERROR: 'error',
  PLAYER_JOINED: 'playerJoined',
  PLAYER_LEFT: 'playerLeft',
  PLAYER_DISCONNECTED: 'playerDisconnected',
  PLAYER_RECONNECTED: 'playerReconnected',
  PROFILE_CREDENTIALS_REVOKED: 'profileCredentialsRevoked',
  SESSION_REPLACED: 'sessionReplaced',
  SERVER_RESTARTING: 'serverRestarting',
} as const;
