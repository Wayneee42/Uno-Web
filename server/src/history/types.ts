import type {
  MatchEndReason,
  MatchEventRecord,
  MatchPlayerResult,
  MatchStatus,
  ProfileStats,
} from '@uno-web/shared';

export interface StoredProfile {
  id: string;
  recoveryHash: string;
  displayName: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ArchivedParticipant {
  profileId: string | null;
  playerId: string;
  displayName: string;
  seatIndex: number;
  result: MatchPlayerResult;
  finalHandCount: number | null;
  finalHandScore: number | null;
  voluntarilyLeft: boolean;
}

export interface ArchivedMatch {
  id: string;
  roomId: string;
  serverInstanceId: string;
  status: MatchStatus;
  endReason: MatchEndReason | null;
  startedAt: number;
  endedAt: number | null;
  updatedAt: number;
  participants: ArchivedParticipant[];
  events: MatchEventRecord[];
}

export interface MatchCursor {
  startedAt: number;
  id: string;
}

export interface ArchivedMatchPage {
  matches: ArchivedMatch[];
  hasMore: boolean;
}

export interface HistoryRepository {
  createProfile(profile: StoredProfile): Promise<void>;
  findProfileByRecoveryHash(recoveryHash: string): Promise<StoredProfile | null>;
  updateProfileRecoveryHash(
    profileId: string,
    recoveryHash: string,
    updatedAt: number
  ): Promise<void>;
  updateProfileDisplayName(
    profileId: string,
    displayName: string,
    updatedAt: number
  ): Promise<void>;
  saveMatch(match: ArchivedMatch): Promise<void>;
  listMatches(profileId: string, limit: number, cursor?: MatchCursor): Promise<ArchivedMatchPage>;
  getMatch(profileId: string, matchId: string): Promise<ArchivedMatch | null>;
  getProfileStats(profileId: string): Promise<ProfileStats>;
  registerInstance(instanceId: string, startedAt: number): Promise<void>;
  heartbeatInstance(instanceId: string, heartbeatAt: number): Promise<void>;
  stopInstance(instanceId: string, stoppedAt: number): Promise<void>;
  markStaleMatchesInterrupted(staleBefore: number, endedAt: number): Promise<number>;
  close(): Promise<void>;
}
