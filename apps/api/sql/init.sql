CREATE TABLE IF NOT EXISTS robots (
  robot_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recordings (
  id TEXT PRIMARY KEY,
  robot_id TEXT NOT NULL REFERENCES robots(robot_id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  sensor_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'recording',
  storage_prefix TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sensor_chunks (
  id TEXT PRIMARY KEY,
  recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  robot_id TEXT NOT NULL REFERENCES robots(robot_id) ON DELETE CASCADE,
  sensor_type TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  message_count INTEGER NOT NULL,
  byte_size INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  content_encoding TEXT NOT NULL DEFAULT 'gzip',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sensor_events (
  id BIGSERIAL PRIMARY KEY,
  recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  robot_id TEXT NOT NULL REFERENCES robots(robot_id) ON DELETE CASCADE,
  sensor_type TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  sequence BIGINT NOT NULL,
  anomaly BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB NOT NULL,
  chunk_id TEXT REFERENCES sensor_chunks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recordings_robot_started_at ON recordings(robot_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_recordings_sensor_types ON recordings USING GIN(sensor_types);
CREATE INDEX IF NOT EXISTS idx_sensor_events_robot_ts ON sensor_events(robot_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_events_recording_ts ON sensor_events(recording_id, ts ASC);
CREATE INDEX IF NOT EXISTS idx_sensor_events_payload ON sensor_events USING GIN(payload);
CREATE INDEX IF NOT EXISTS idx_sensor_events_anomaly ON sensor_events(anomaly) WHERE anomaly = TRUE;
