import type { ProfileStats } from '@uno-web/shared';
import type {
  ArchivedMatch,
  ArchivedMatchPage,
  HistoryRepository,
  MatchCursor,
  StoredProfile,
} from './types.js';

function cloneMatch(match: ArchivedMatch): ArchivedMatch {
  return {
    ...match,
    participants: match.participants.map(participant => ({ ...participant })),
    events: match.events.map(event => ({ ...event })),
  };
}

export class InMemoryHistoryRepository implements HistoryRepository {
  private profiles = new Map<string, StoredProfile>();
  private profileIdsByRecoveryHash = new Map<string, string>();
  private matches = new Map<string, ArchivedMatch>();
  private instanceHeartbeats = new Map<string, number>();

  async createProfile(profile: StoredProfile): Promise<void> {
    this.profiles.set(profile.id, { ...profile });
    this.profileIdsByRecoveryHash.set(profile.recoveryHash, profile.id);
  }

  async findProfileByRecoveryHash(recoveryHash: string): Promise<StoredProfile | null> {
    const profileId = this.profileIdsByRecoveryHash.get(recoveryHash);
    const profile = profileId ? this.profiles.get(profileId) : undefined;
    return profile ? { ...profile } : null;
  }

  async updateProfileRecoveryHash(
    profileId: string,
    recoveryHash: string,
    updatedAt: number
  ): Promise<void> {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error('Profile not found');
    }
    this.profileIdsByRecoveryHash.delete(profile.recoveryHash);
    profile.recoveryHash = recoveryHash;
    profile.updatedAt = updatedAt;
    this.profileIdsByRecoveryHash.set(recoveryHash, profileId);
  }

  async updateProfileDisplayName(
    profileId: string,
    displayName: string,
    updatedAt: number
  ): Promise<void> {
    const profile = this.profiles.get(profileId);
    if (!profile) return;
    profile.displayName = displayName;
    profile.updatedAt = updatedAt;
  }

  async saveMatch(match: ArchivedMatch): Promise<void> {
    const existing = this.matches.get(match.id);
    if (existing && existing.status !== 'active' && match.status === 'active') {
      return;
    }
    this.matches.set(match.id, cloneMatch(match));
  }

  async listMatches(
    profileId: string,
    limit: number,
    cursor?: MatchCursor
  ): Promise<ArchivedMatchPage> {
    const matches = Array.from(this.matches.values())
      .filter(match => match.status !== 'active')
      .filter(match => match.participants.some(participant => participant.profileId === profileId))
      .filter(match => {
        if (!cursor) return true;
        return match.startedAt < cursor.startedAt ||
          (match.startedAt === cursor.startedAt && match.id < cursor.id);
      })
      .sort((a, b) => b.startedAt - a.startedAt || b.id.localeCompare(a.id));

    return {
      matches: matches.slice(0, limit).map(cloneMatch),
      hasMore: matches.length > limit,
    };
  }

  async getMatch(profileId: string, matchId: string): Promise<ArchivedMatch | null> {
    const match = this.matches.get(matchId);
    if (!match || !match.participants.some(participant => participant.profileId === profileId)) {
      return null;
    }
    return cloneMatch(match);
  }

  async getProfileStats(profileId: string): Promise<ProfileStats> {
    const matches = Array.from(this.matches.values()).filter(
      match =>
        match.status !== 'active' &&
        match.participants.some(participant => participant.profileId === profileId)
    );
    const participants = matches
      .map(match => match.participants.find(participant => participant.profileId === profileId))
      .filter(
        (participant): participant is NonNullable<typeof participant> => Boolean(participant)
      );
    const completedGames = participants.filter(
      participant => participant.result === 'win' || participant.result === 'loss'
    ).length;
    const voluntaryExits = participants.filter(participant => participant.voluntarilyLeft).length;

    return {
      startedGames: matches.length,
      completedGames,
      wins: participants.filter(participant => participant.result === 'win').length,
      losses: participants.filter(participant => participant.result === 'loss').length,
      draws: participants.filter(participant => participant.result === 'draw').length,
      voluntaryExits,
      voluntaryExitRate: matches.length === 0 ? 0 : voluntaryExits / matches.length,
    };
  }

  async registerInstance(instanceId: string, startedAt: number): Promise<void> {
    this.instanceHeartbeats.set(instanceId, startedAt);
  }

  async heartbeatInstance(instanceId: string, heartbeatAt: number): Promise<void> {
    this.instanceHeartbeats.set(instanceId, heartbeatAt);
  }

  async stopInstance(instanceId: string): Promise<void> {
    this.instanceHeartbeats.delete(instanceId);
  }

  async markStaleMatchesInterrupted(staleBefore: number, endedAt: number): Promise<number> {
    let updated = 0;
    for (const match of this.matches.values()) {
      const heartbeat = this.instanceHeartbeats.get(match.serverInstanceId);
      if (match.status === 'active' && (!heartbeat || heartbeat < staleBefore)) {
        match.status = 'interrupted';
        match.endReason = 'server_crash';
        match.endedAt = endedAt;
        match.updatedAt = endedAt;
        updated += 1;
      }
    }
    return updated;
  }

  async close(): Promise<void> {}
}
