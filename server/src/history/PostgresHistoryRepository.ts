import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { ProfileStats } from '@uno-web/shared';
import type {
  ArchivedMatch,
  ArchivedMatchPage,
  ArchivedParticipant,
  HistoryRepository,
  MatchCursor,
  StoredProfile,
} from './types.js';

function toMillis(value: Date | string): number {
  return new Date(value).getTime();
}

function mapProfile(row: QueryResultRow): StoredProfile {
  return {
    id: row.id,
    recoveryHash: row.recovery_hash,
    displayName: row.display_name,
    createdAt: toMillis(row.created_at),
    updatedAt: toMillis(row.updated_at),
  };
}

export class PostgresHistoryRepository implements HistoryRepository {
  constructor(private readonly pool: Pool) {}

  async createProfile(profile: StoredProfile): Promise<void> {
    await this.pool.query(
      `INSERT INTO profiles (id, recovery_hash, display_name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         recovery_hash = EXCLUDED.recovery_hash,
         display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
         updated_at = EXCLUDED.updated_at`,
      [
        profile.id,
        profile.recoveryHash,
        profile.displayName,
        new Date(profile.createdAt),
        new Date(profile.updatedAt),
      ]
    );
  }

  async findProfileByRecoveryHash(recoveryHash: string): Promise<StoredProfile | null> {
    const result = await this.pool.query(
      `SELECT id, recovery_hash, display_name, created_at, updated_at
       FROM profiles
       WHERE recovery_hash = $1`,
      [recoveryHash]
    );
    return result.rows[0] ? mapProfile(result.rows[0]) : null;
  }

  async updateProfileRecoveryHash(
    profileId: string,
    recoveryHash: string,
    updatedAt: number
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE profiles
       SET recovery_hash = $2, updated_at = $3
       WHERE id = $1`,
      [profileId, recoveryHash, new Date(updatedAt)]
    );
    if (result.rowCount === 0) {
      throw new Error('Profile not found');
    }
  }

  async updateProfileDisplayName(
    profileId: string,
    displayName: string,
    updatedAt: number
  ): Promise<void> {
    await this.pool.query(
      `UPDATE profiles
       SET display_name = $2, updated_at = $3
       WHERE id = $1`,
      [profileId, displayName, new Date(updatedAt)]
    );
  }

  async saveMatch(match: ArchivedMatch): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO matches (
           id, room_id, server_instance_id, status, end_reason,
           started_at, ended_at, updated_at, rules_version
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           end_reason = EXCLUDED.end_reason,
           ended_at = EXCLUDED.ended_at,
           updated_at = EXCLUDED.updated_at
         WHERE matches.status = 'active' OR EXCLUDED.status <> 'active'`,
        [
          match.id,
          match.roomId,
          match.serverInstanceId,
          match.status,
          match.endReason,
          new Date(match.startedAt),
          match.endedAt ? new Date(match.endedAt) : null,
          new Date(match.updatedAt),
        ]
      );

      for (const participant of match.participants) {
        await this.saveParticipant(client, match.id, participant);
      }

      for (const event of match.events) {
        await client.query(
          `INSERT INTO match_events (
             match_id, sequence, event_type, actor_player_id, message, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (match_id, sequence) DO NOTHING`,
          [
            match.id,
            event.sequence,
            event.type,
            event.actorPlayerId ?? null,
            event.message,
            new Date(event.createdAt),
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listMatches(
    profileId: string,
    limit: number,
    cursor?: MatchCursor
  ): Promise<ArchivedMatchPage> {
    const values: unknown[] = [profileId, limit + 1];
    let cursorClause = '';
    if (cursor) {
      values.push(new Date(cursor.startedAt), cursor.id);
      cursorClause = 'AND (m.started_at < $3 OR (m.started_at = $3 AND m.id < $4::uuid))';
    }

    const result = await this.pool.query(
      `SELECT m.id
       FROM matches m
       INNER JOIN match_players mine
         ON mine.match_id = m.id AND mine.profile_id = $1
       WHERE m.status <> 'active'
       ${cursorClause}
       ORDER BY m.started_at DESC, m.id DESC
       LIMIT $2`,
      values
    );
    const hasMore = result.rows.length > limit;
    const ids = result.rows.slice(0, limit).map(row => row.id as string);
    const matches = await this.loadMatches(ids, false);
    const byId = new Map(matches.map(match => [match.id, match]));

    return {
      matches: ids
        .map(id => byId.get(id))
        .filter((match): match is ArchivedMatch => Boolean(match)),
      hasMore,
    };
  }

  async getMatch(profileId: string, matchId: string): Promise<ArchivedMatch | null> {
    const allowed = await this.pool.query(
      `SELECT 1
       FROM match_players
       WHERE match_id = $1 AND profile_id = $2`,
      [matchId, profileId]
    );
    if (allowed.rowCount === 0) return null;
    const matches = await this.loadMatches([matchId], true);
    return matches[0] ?? null;
  }

  async getProfileStats(profileId: string): Promise<ProfileStats> {
    const result = await this.pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE m.status <> 'active')::int AS started_games,
         COUNT(*) FILTER (WHERE mp.result IN ('win', 'loss'))::int AS completed_games,
         COUNT(*) FILTER (WHERE mp.result = 'win')::int AS wins,
         COUNT(*) FILTER (WHERE mp.result = 'loss')::int AS losses,
         COUNT(*) FILTER (WHERE mp.result = 'draw')::int AS draws,
         COUNT(*) FILTER (WHERE mp.voluntarily_left)::int AS voluntary_exits
       FROM match_players mp
       INNER JOIN matches m ON m.id = mp.match_id
       WHERE mp.profile_id = $1 AND m.status <> 'active'`,
      [profileId]
    );
    const row = result.rows[0];
    const startedGames = Number(row.started_games ?? 0);
    const voluntaryExits = Number(row.voluntary_exits ?? 0);
    return {
      startedGames,
      completedGames: Number(row.completed_games ?? 0),
      wins: Number(row.wins ?? 0),
      losses: Number(row.losses ?? 0),
      draws: Number(row.draws ?? 0),
      voluntaryExits,
      voluntaryExitRate: startedGames === 0 ? 0 : voluntaryExits / startedGames,
    };
  }

  async registerInstance(instanceId: string, startedAt: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO service_instances (id, started_at, last_heartbeat_at, stopped_at)
       VALUES ($1, $2, $2, NULL)
       ON CONFLICT (id) DO UPDATE SET
         last_heartbeat_at = EXCLUDED.last_heartbeat_at,
         stopped_at = NULL`,
      [instanceId, new Date(startedAt)]
    );
  }

  async heartbeatInstance(instanceId: string, heartbeatAt: number): Promise<void> {
    await this.pool.query(
      `UPDATE service_instances
       SET last_heartbeat_at = $2
       WHERE id = $1`,
      [instanceId, new Date(heartbeatAt)]
    );
  }

  async stopInstance(instanceId: string, stoppedAt: number): Promise<void> {
    await this.pool.query(
      `UPDATE service_instances
       SET stopped_at = $2, last_heartbeat_at = $2
       WHERE id = $1`,
      [instanceId, new Date(stoppedAt)]
    );
  }

  async markStaleMatchesInterrupted(staleBefore: number, endedAt: number): Promise<number> {
    const result = await this.pool.query(
      `UPDATE matches m
       SET status = 'interrupted',
           end_reason = 'server_crash',
           ended_at = $2,
           updated_at = $2
       WHERE m.status = 'active'
         AND NOT EXISTS (
           SELECT 1
           FROM service_instances si
           WHERE si.id = m.server_instance_id
             AND si.stopped_at IS NULL
             AND si.last_heartbeat_at >= $1
         )`,
      [new Date(staleBefore), new Date(endedAt)]
    );
    return result.rowCount ?? 0;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async saveParticipant(
    client: PoolClient,
    matchId: string,
    participant: ArchivedParticipant
  ): Promise<void> {
    await client.query(
      `INSERT INTO match_players (
         match_id, player_id, profile_id, display_name, seat_index,
         result, final_hand_count, final_hand_score, voluntarily_left
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (match_id, player_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         result = EXCLUDED.result,
         final_hand_count = EXCLUDED.final_hand_count,
         final_hand_score = EXCLUDED.final_hand_score,
         voluntarily_left = EXCLUDED.voluntarily_left`,
      [
        matchId,
        participant.playerId,
        participant.profileId,
        participant.displayName,
        participant.seatIndex,
        participant.result,
        participant.finalHandCount,
        participant.finalHandScore,
        participant.voluntarilyLeft,
      ]
    );
  }

  private async loadMatches(ids: string[], includeEvents: boolean): Promise<ArchivedMatch[]> {
    if (ids.length === 0) return [];
    const [matchResult, participantResult, eventResult] = await Promise.all([
      this.pool.query(
        `SELECT id, room_id, server_instance_id, status, end_reason,
                started_at, ended_at, updated_at
         FROM matches
         WHERE id = ANY($1::uuid[])`,
        [ids]
      ),
      this.pool.query(
        `SELECT match_id, player_id, profile_id, display_name, seat_index,
                result, final_hand_count, final_hand_score, voluntarily_left
         FROM match_players
         WHERE match_id = ANY($1::uuid[])
         ORDER BY seat_index`,
        [ids]
      ),
      includeEvents
        ? this.pool.query(
            `SELECT match_id, sequence, event_type, actor_player_id, message, created_at
             FROM match_events
             WHERE match_id = ANY($1::uuid[])
             ORDER BY sequence`,
            [ids]
          )
        : Promise.resolve({ rows: [] } as { rows: QueryResultRow[] }),
    ]);

    return matchResult.rows.map(row => ({
      id: row.id,
      roomId: row.room_id,
      serverInstanceId: row.server_instance_id,
      status: row.status,
      endReason: row.end_reason,
      startedAt: toMillis(row.started_at),
      endedAt: row.ended_at ? toMillis(row.ended_at) : null,
      updatedAt: toMillis(row.updated_at),
      participants: participantResult.rows
        .filter(participant => participant.match_id === row.id)
        .map(participant => ({
          profileId: participant.profile_id,
          playerId: participant.player_id,
          displayName: participant.display_name,
          seatIndex: participant.seat_index,
          result: participant.result,
          finalHandCount: participant.final_hand_count,
          finalHandScore: participant.final_hand_score,
          voluntarilyLeft: participant.voluntarily_left,
        })),
      events: eventResult.rows
        .filter(event => event.match_id === row.id)
        .map(event => ({
          sequence: event.sequence,
          type: event.event_type,
          actorPlayerId: event.actor_player_id ?? undefined,
          message: event.message,
          createdAt: toMillis(event.created_at),
        })),
    }));
  }
}
