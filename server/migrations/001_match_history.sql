CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY,
  recovery_hash CHAR(64) NOT NULL UNIQUE,
  display_name VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS service_instances (
  id UUID PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL,
  last_heartbeat_at TIMESTAMPTZ NOT NULL,
  stopped_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY,
  room_id VARCHAR(6) NOT NULL,
  server_instance_id UUID NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('active', 'completed', 'draw', 'interrupted')),
  end_reason VARCHAR(32) CHECK (
    end_reason IS NULL OR end_reason IN (
      'win', 'draw', 'player_exit', 'disconnect_timeout',
      'host_abort', 'server_shutdown', 'server_crash', 'server_error'
    )
  ),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL,
  rules_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS match_players (
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id VARCHAR(32) NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  display_name VARCHAR(20) NOT NULL,
  seat_index SMALLINT NOT NULL,
  result VARCHAR(8) NOT NULL CHECK (result IN ('win', 'loss', 'draw', 'none')),
  final_hand_count SMALLINT,
  final_hand_score INTEGER,
  voluntarily_left BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (match_id, player_id)
);

CREATE TABLE IF NOT EXISTS match_events (
  id BIGSERIAL PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  actor_player_id VARCHAR(32),
  message TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (match_id, sequence)
);

CREATE INDEX IF NOT EXISTS match_players_profile_history_idx
  ON match_players (profile_id, match_id)
  WHERE profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS matches_started_at_idx
  ON matches (started_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS matches_active_instance_idx
  ON matches (server_instance_id, updated_at)
  WHERE status = 'active';
