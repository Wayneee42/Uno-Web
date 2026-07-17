import { createHash, randomBytes, randomUUID } from 'crypto';
import type {
  GameState,
  InitializeProfileResponse,
  MatchDetails,
  MatchEndReason,
  MatchHistoryPage,
  MatchSummary,
  PlayerProfile,
  ProfileStats,
  RotateRecoveryCodeResponse,
} from '@uno-web/shared';
import { getCardScore } from '../game/DeckManager.js';
import { logger, normalizeError } from '../utils/logger.js';
import { InMemoryHistoryRepository } from './InMemoryHistoryRepository.js';
import type {
  ArchivedMatch,
  ArchivedParticipant,
  HistoryRepository,
  MatchCursor,
  StoredProfile,
} from './types.js';

const HEARTBEAT_INTERVAL_MS = 15_000;
const RETRY_INTERVAL_MS = 10_000;
const STALE_INSTANCE_MS = 90_000;
const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 50;
const RECOVERY_CODE_PATTERN = /^uno_[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PendingTask = {
  version: number;
  run: () => Promise<void>;
};

type ArchiveOverride = {
  endReason: MatchEndReason;
  voluntaryPlayerId?: string;
};

function createRecoveryCode(): string {
  return `uno_${randomBytes(32).toString('base64url')}`;
}

function hashRecoveryCode(recoveryCode: string): string {
  return createHash('sha256').update(recoveryCode).digest('hex');
}

function scoreHand(state: GameState, playerId: string): number {
  const player = state.players.find(item => item.id === playerId);
  if (!player) return 0;
  return player.hand.reduce((score, card) => score + getCardScore(card), 0);
}

function interruptionMessage(reason: MatchEndReason): string {
  switch (reason) {
    case 'player_exit':
      return 'Game interrupted because a player left.';
    case 'disconnect_timeout':
      return 'Game interrupted after a reconnection timeout.';
    case 'host_abort':
      return 'Game interrupted by the host.';
    case 'server_shutdown':
      return 'Game interrupted while the server was restarting.';
    case 'server_crash':
      return 'Game interrupted after the server stopped unexpectedly.';
    default:
      return 'Game interrupted by a server error.';
  }
}

export class HistoryService {
  readonly instanceId = randomUUID();

  private readonly memoryRepository = new InMemoryHistoryRepository();
  private readonly profiles = new Map<string, StoredProfile>();
  private readonly persistentProfileIds = new Set<string>();
  private readonly liveArchives = new Map<string, ArchivedMatch>();
  private readonly pendingTasks = new Map<string, PendingTask>();
  private taskVersion = 0;
  private flushPromise: Promise<void> | null = null;
  private primaryHealthy: boolean;
  private started = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(private readonly primaryRepository: HistoryRepository | null) {
    this.primaryHealthy = false;
  }

  isHistoryAvailable(): boolean {
    return Boolean(this.primaryRepository) && this.primaryHealthy;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    if (!this.primaryRepository) {
      logger.warn('history.memory_only', { reason: 'DATABASE_URL is not configured' });
      return;
    }

    try {
      await this.primaryRepository.registerInstance(this.instanceId, Date.now());
      this.primaryHealthy = true;
      await this.reconcileStaleMatches();
    } catch (error) {
      this.primaryHealthy = false;
      logger.error('history.start_failed', { error: normalizeError(error) });
      this.enqueue('instance:register', () =>
        this.primaryRepository!.registerInstance(this.instanceId, Date.now())
      );
    }

    this.heartbeatTimer = setInterval(() => {
      this.enqueue('instance:heartbeat', () =>
        this.primaryRepository!.heartbeatInstance(this.instanceId, Date.now())
      );
      void this.reconcileStaleMatches();
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref();

    this.retryTimer = setInterval(() => void this.flushPending(), RETRY_INTERVAL_MS);
    this.retryTimer.unref();
  }

  async initializeProfile(recoveryCode?: string): Promise<InitializeProfileResponse> {
    const normalizedCode = recoveryCode?.trim();
    if (normalizedCode) {
      if (!RECOVERY_CODE_PATTERN.test(normalizedCode)) {
        return {
          success: false,
          historyAvailable: this.isHistoryAvailable(),
          error: 'Invalid recovery code format',
        };
      }

      const recoveryHash = hashRecoveryCode(normalizedCode);
      let profile = await this.memoryRepository.findProfileByRecoveryHash(recoveryHash);
      if (!profile && this.primaryRepository) {
        try {
          profile = await this.primaryRepository.findProfileByRecoveryHash(recoveryHash);
          this.primaryHealthy = true;
          if (profile) {
            await this.memoryRepository.createProfile(profile);
            this.profiles.set(profile.id, profile);
            this.persistentProfileIds.add(profile.id);
          }
        } catch (error) {
          this.primaryHealthy = false;
          logger.warn('history.profile_lookup_failed', { error: normalizeError(error) });
          return {
            success: false,
            historyAvailable: false,
            error: 'Player history is temporarily unavailable. You can still play as a guest.',
          };
        }
      }

      if (!profile) {
        return {
          success: false,
          historyAvailable: this.isHistoryAvailable(),
          error: 'Recovery code not found',
        };
      }

      this.profiles.set(profile.id, profile);
      return {
        success: true,
        profile: this.toPlayerProfile(profile),
        historyAvailable: this.isHistoryAvailable(),
      };
    }

    const now = Date.now();
    const newRecoveryCode = createRecoveryCode();
    const profile: StoredProfile = {
      id: randomUUID(),
      recoveryHash: hashRecoveryCode(newRecoveryCode),
      displayName: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.memoryRepository.createProfile(profile);
    this.profiles.set(profile.id, profile);

    if (this.primaryRepository) {
      try {
        await this.primaryRepository.createProfile(profile);
        this.primaryHealthy = true;
        this.persistentProfileIds.add(profile.id);
      } catch (error) {
        this.primaryHealthy = false;
        logger.warn('history.profile_create_deferred', { error: normalizeError(error) });
        this.enqueue(`profile:${profile.id}`, async () => {
          await this.primaryRepository!.createProfile(profile);
          this.persistentProfileIds.add(profile.id);
        });
      }
    }

    return {
      success: true,
      profile: this.toPlayerProfile(profile),
      recoveryCode: newRecoveryCode,
      historyAvailable: this.isHistoryAvailable(),
    };
  }

  async rotateRecoveryCode(profileId: string): Promise<RotateRecoveryCodeResponse> {
    const profile = this.profiles.get(profileId);
    if (!profile || !this.primaryRepository) {
      return { success: false, error: 'Persistent player history is unavailable' };
    }

    const recoveryCode = createRecoveryCode();
    const recoveryHash = hashRecoveryCode(recoveryCode);
    const updatedAt = Date.now();
    try {
      await this.primaryRepository.updateProfileRecoveryHash(profileId, recoveryHash, updatedAt);
      await this.memoryRepository.updateProfileRecoveryHash(profileId, recoveryHash, updatedAt);
      profile.recoveryHash = recoveryHash;
      profile.updatedAt = updatedAt;
      this.primaryHealthy = true;
      this.persistentProfileIds.add(profileId);
      return { success: true, recoveryCode };
    } catch (error) {
      this.primaryHealthy = false;
      logger.warn('history.recovery_rotate_failed', { profileId, error: normalizeError(error) });
      return { success: false, error: 'Could not rotate recovery code. Try again later.' };
    }
  }

  updateProfileDisplayName(profileId: string | null, displayName: string): void {
    if (!profileId) return;
    const profile = this.profiles.get(profileId);
    if (profile) {
      profile.displayName = displayName;
      profile.updatedAt = Date.now();
      void this.memoryRepository.updateProfileDisplayName(
        profileId,
        displayName,
        profile.updatedAt
      );
    }
    if (this.primaryRepository) {
      const updatedAt = Date.now();
      this.enqueue(`profile-name:${profileId}`, () =>
        this.primaryRepository!.updateProfileDisplayName(profileId, displayName, updatedAt)
      );
    }
  }

  observeGame(state: GameState): void {
    const archive = this.buildArchive(state);
    this.liveArchives.set(state.matchId, archive);
    this.persistArchive(archive);
  }

  interruptGame(
    state: GameState,
    endReason: Exclude<MatchEndReason, 'win' | 'draw'>,
    voluntaryPlayerId?: string
  ): void {
    if (state.phase === 'finished') {
      this.observeGame(state);
      return;
    }
    const archive = this.buildArchive(state, { endReason, voluntaryPlayerId });
    const sequence = Math.max(0, ...archive.events.map(event => event.sequence)) + 1;
    archive.events.push({
      sequence,
      type: 'game_interrupted',
      actorPlayerId: voluntaryPlayerId,
      message: interruptionMessage(endReason),
      createdAt: archive.endedAt ?? Date.now(),
    });
    this.liveArchives.set(state.matchId, archive);
    this.persistArchive(archive);
  }

  async listMatches(
    profileId: string,
    limit = DEFAULT_HISTORY_LIMIT,
    encodedCursor?: string
  ): Promise<{ page: MatchHistoryPage; historyAvailable: boolean }> {
    const safeLimit = Math.max(1, Math.min(MAX_HISTORY_LIMIT, limit));
    const cursor = this.decodeCursor(encodedCursor);
    if (!(await this.preparePrimaryRead())) {
      const fallback = await this.memoryRepository.listMatches(profileId, safeLimit, cursor);
      return {
        page: {
          matches: fallback.matches.map(match => this.toMatchSummary(match, profileId)),
          nextCursor: null,
        },
        historyAvailable: false,
      };
    }
    const repository = this.primaryRepository ?? this.memoryRepository;
    try {
      const result = await repository.listMatches(profileId, safeLimit, cursor);
      if (this.primaryRepository) this.primaryHealthy = true;
      const matches = result.matches.map(match => this.toMatchSummary(match, profileId));
      const last = result.matches[result.matches.length - 1];
      return {
        page: {
          matches,
          nextCursor: result.hasMore && last
            ? this.encodeCursor({ startedAt: last.startedAt, id: last.id })
            : null,
        },
        historyAvailable: this.isHistoryAvailable(),
      };
    } catch (error) {
      this.primaryHealthy = false;
      logger.warn('history.list_failed', { profileId, error: normalizeError(error) });
      const fallback = await this.memoryRepository.listMatches(profileId, safeLimit, cursor);
      return {
        page: {
          matches: fallback.matches.map(match => this.toMatchSummary(match, profileId)),
          nextCursor: null,
        },
        historyAvailable: false,
      };
    }
  }

  async getMatch(
    profileId: string,
    matchId: string
  ): Promise<{ match: MatchDetails | null; historyAvailable: boolean }> {
    if (!(await this.preparePrimaryRead())) {
      const match = await this.memoryRepository.getMatch(profileId, matchId);
      return {
        match: match ? this.toMatchDetails(match, profileId) : null,
        historyAvailable: false,
      };
    }
    const repository = this.primaryRepository ?? this.memoryRepository;
    try {
      const match = await repository.getMatch(profileId, matchId);
      if (this.primaryRepository) this.primaryHealthy = true;
      return {
        match: match ? this.toMatchDetails(match, profileId) : null,
        historyAvailable: this.isHistoryAvailable(),
      };
    } catch (error) {
      this.primaryHealthy = false;
      logger.warn('history.details_failed', { profileId, matchId, error: normalizeError(error) });
      const match = await this.memoryRepository.getMatch(profileId, matchId);
      return {
        match: match ? this.toMatchDetails(match, profileId) : null,
        historyAvailable: false,
      };
    }
  }

  async getProfileStats(
    profileId: string
  ): Promise<{ stats: ProfileStats; historyAvailable: boolean }> {
    if (!(await this.preparePrimaryRead())) {
      return {
        stats: await this.memoryRepository.getProfileStats(profileId),
        historyAvailable: false,
      };
    }
    const repository = this.primaryRepository ?? this.memoryRepository;
    try {
      const stats = await repository.getProfileStats(profileId);
      if (this.primaryRepository) this.primaryHealthy = true;
      return { stats, historyAvailable: this.isHistoryAvailable() };
    } catch (error) {
      this.primaryHealthy = false;
      logger.warn('history.stats_failed', { profileId, error: normalizeError(error) });
      return {
        stats: await this.memoryRepository.getProfileStats(profileId),
        historyAvailable: false,
      };
    }
  }

  async shutdown(
    activeGames: GameState[],
    endReason: 'server_shutdown' | 'server_error' = 'server_shutdown'
  ): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.retryTimer) clearInterval(this.retryTimer);
    for (const game of activeGames) {
      this.interruptGame(game, endReason);
    }
    await this.flushUntil(Date.now() + 5_000);
    if (this.primaryRepository) {
      try {
        await this.primaryRepository.stopInstance(this.instanceId, Date.now());
      } catch (error) {
        logger.warn('history.instance_stop_failed', { error: normalizeError(error) });
      }
      await this.primaryRepository.close();
    }
  }

  private buildArchive(state: GameState, override?: ArchiveOverride): ArchivedMatch {
    const now = Date.now();
    const existing = this.liveArchives.get(state.matchId);
    const eventsBySequence = new Map(
      (existing?.events ?? []).map(event => [event.sequence, event])
    );
    for (const event of state.eventLog) {
      eventsBySequence.set(event.sequence, {
        sequence: event.sequence,
        type: event.type,
        actorPlayerId: event.actorPlayerId,
        message: event.message,
        createdAt: event.createdAt,
      });
    }

    const status = override
      ? 'interrupted'
      : state.phase === 'finished'
        ? state.isDraw
          ? 'draw'
          : 'completed'
        : 'active';
    const endReason: MatchEndReason | null = override
      ? override.endReason
      : status === 'completed'
        ? 'win'
        : status === 'draw'
          ? 'draw'
          : null;
    const terminal = status !== 'active';
    const endedAt = terminal ? existing?.endedAt ?? now : null;
    const participants: ArchivedParticipant[] = state.players.map((player, seatIndex) => ({
      profileId: player.profileId,
      playerId: player.id,
      displayName: player.name,
      seatIndex,
      result: status === 'completed'
        ? player.id === state.winnerId
          ? 'win'
          : 'loss'
        : status === 'draw'
          ? 'draw'
          : 'none',
      finalHandCount: player.hand.length,
      finalHandScore: scoreHand(state, player.id),
      voluntarilyLeft:
        existing?.participants.find(item => item.playerId === player.id)?.voluntarilyLeft ===
          true ||
        override?.voluntaryPlayerId === player.id,
    }));

    return {
      id: state.matchId,
      roomId: state.roomId,
      serverInstanceId: this.instanceId,
      status,
      endReason,
      startedAt: state.startedAt,
      endedAt,
      updatedAt: now,
      participants,
      events: Array.from(eventsBySequence.values()).sort((a, b) => a.sequence - b.sequence),
    };
  }

  private persistArchive(archive: ArchivedMatch): void {
    void this.memoryRepository.saveMatch(archive);
    if (this.primaryRepository) {
      this.enqueue(`match:${archive.id}`, () => this.primaryRepository!.saveMatch(archive));
    }
  }

  private enqueue(key: string, run: () => Promise<void>): void {
    this.taskVersion += 1;
    this.pendingTasks.set(key, { version: this.taskVersion, run });
    void this.flushPending();
  }

  private async flushPending(): Promise<void> {
    if (!this.primaryRepository || this.flushPromise) {
      return this.flushPromise ?? Promise.resolve();
    }

    this.flushPromise = (async () => {
      while (this.pendingTasks.size > 0) {
        const entry = this.pendingTasks.entries().next().value as
          | [string, PendingTask]
          | undefined;
        if (!entry) break;
        const [key, task] = entry;
        try {
          await task.run();
          if (this.pendingTasks.get(key)?.version === task.version) {
            this.pendingTasks.delete(key);
          }
          this.primaryHealthy = true;
        } catch (error) {
          this.primaryHealthy = false;
          logger.warn('history.persistence_deferred', { key, error: normalizeError(error) });
          break;
        }
      }
    })().finally(() => {
      this.flushPromise = null;
    });

    return this.flushPromise;
  }

  private async flushUntil(deadline: number): Promise<void> {
    while (this.pendingTasks.size > 0 && Date.now() < deadline) {
      await this.flushPending();
      if (this.pendingTasks.size > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  private async preparePrimaryRead(): Promise<boolean> {
    if (!this.primaryRepository || this.pendingTasks.size === 0) return true;
    await this.flushPending();
    return this.pendingTasks.size === 0;
  }

  private async reconcileStaleMatches(): Promise<void> {
    if (!this.primaryRepository) return;
    try {
      const now = Date.now();
      const count = await this.primaryRepository.markStaleMatchesInterrupted(
        now - STALE_INSTANCE_MS,
        now
      );
      this.primaryHealthy = true;
      if (count > 0) logger.info('history.stale_matches_interrupted', { count });
    } catch (error) {
      this.primaryHealthy = false;
      logger.warn('history.reconcile_failed', { error: normalizeError(error) });
    }
  }

  private toPlayerProfile(profile: StoredProfile): PlayerProfile {
    return {
      id: profile.id,
      displayName: profile.displayName,
      persistent: this.persistentProfileIds.has(profile.id),
      createdAt: profile.createdAt,
    };
  }

  private toMatchSummary(match: ArchivedMatch, profileId: string): MatchSummary {
    return {
      id: match.id,
      roomId: match.roomId,
      status: match.status,
      endReason: match.endReason,
      startedAt: match.startedAt,
      endedAt: match.endedAt,
      durationMs: match.endedAt ? Math.max(0, match.endedAt - match.startedAt) : null,
      participants: match.participants.map(participant => ({
        playerId: participant.playerId,
        displayName: participant.displayName,
        seatIndex: participant.seatIndex,
        result: participant.result,
        finalHandCount: participant.finalHandCount,
        finalHandScore: participant.finalHandScore,
        voluntarilyLeft: participant.voluntarilyLeft,
        isCurrentProfile: participant.profileId === profileId,
      })),
    };
  }

  private toMatchDetails(match: ArchivedMatch, profileId: string): MatchDetails {
    return {
      ...this.toMatchSummary(match, profileId),
      events: match.events,
    };
  }

  private encodeCursor(cursor: MatchCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }

  private decodeCursor(encodedCursor?: string): MatchCursor | undefined {
    if (!encodedCursor) return undefined;
    try {
      const parsed = JSON.parse(
        Buffer.from(encodedCursor, 'base64url').toString('utf8')
      ) as MatchCursor;
      if (Number.isFinite(parsed.startedAt) && UUID_PATTERN.test(parsed.id)) return parsed;
    } catch {
      return undefined;
    }
    return undefined;
  }
}
