export type MatchStatus = 'active' | 'completed' | 'draw' | 'interrupted';

export type MatchEndReason =
  | 'win'
  | 'draw'
  | 'player_exit'
  | 'disconnect_timeout'
  | 'host_abort'
  | 'server_shutdown'
  | 'server_crash'
  | 'server_error';

export type MatchPlayerResult = 'win' | 'loss' | 'draw' | 'none';

export interface PlayerProfile {
  id: string;
  displayName: string | null;
  persistent: boolean;
  createdAt: number;
}

export interface ProfileStats {
  startedGames: number;
  completedGames: number;
  wins: number;
  losses: number;
  draws: number;
  voluntaryExits: number;
  voluntaryExitRate: number;
}

export interface MatchParticipantRecord {
  playerId: string;
  displayName: string;
  seatIndex: number;
  result: MatchPlayerResult;
  finalHandCount: number | null;
  finalHandScore: number | null;
  voluntarilyLeft: boolean;
  isCurrentProfile: boolean;
}

export interface MatchEventRecord {
  sequence: number;
  type: string;
  actorPlayerId?: string;
  message: string;
  createdAt: number;
}

export interface MatchSummary {
  id: string;
  roomId: string;
  status: MatchStatus;
  endReason: MatchEndReason | null;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  participants: MatchParticipantRecord[];
}

export interface MatchDetails extends MatchSummary {
  events: MatchEventRecord[];
}

export interface MatchHistoryPage {
  matches: MatchSummary[];
  nextCursor: string | null;
}
