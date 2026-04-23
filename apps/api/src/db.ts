import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { ulid } from 'ulid';
import type { RobotRegistration, SensorEventInput } from './types.js';
import { config } from './config.js';


export type RecordingRow = {
  id: string;
  robot_id: string;
  started_at: string;
  ended_at: string | null;
  sensor_types: string[];
  file_size_bytes: number;
  status: string;
  storage_prefix: string;
  created_at: string;
};

export type RobotRow = {
  robot_id: string;
  name: string;
  location: string;
  status: string;
  metadata: Record<string, unknown>;
  last_seen_at: string | null;
};

export type EventRow = {
  id: number;
  recording_id: string;
  robot_id: string;
  sensor_type: string;
  ts: string;
  sequence: string;
  anomaly: boolean;
  payload: Record<string, unknown>;
};

export const pool = new Pool({
  connectionString: config.databaseUrl
});

export async function initDb() {
  const sqlPath = path.resolve(process.cwd(), 'sql/init.sql');
  const sql = await readFile(sqlPath, 'utf8');
  await pool.query(sql);
}

export async function upsertRobot(robot: RobotRegistration) {
  await pool.query(
    `INSERT INTO robots (robot_id, name, location, status, metadata, last_seen_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), NOW())
     ON CONFLICT (robot_id)
     DO UPDATE SET
       name = EXCLUDED.name,
       location = EXCLUDED.location,
       status = EXCLUDED.status,
       metadata = EXCLUDED.metadata,
       last_seen_at = NOW(),
       updated_at = NOW()`,
    [robot.robotId, robot.name, robot.location, robot.status, JSON.stringify(robot.metadata ?? {})]
  );
}

export async function updateRobotStatus(robotId: string, status: string) {
  await pool.query(
    `UPDATE robots
     SET status = $2,
         last_seen_at = NOW(),
         updated_at = NOW()
     WHERE robot_id = $1`,
    [robotId, status]
  );
}

export async function createRecording(robotId: string) {
  const recordingId = ulid();
  const storagePrefix = `${robotId}/${recordingId}`;
  const result = await pool.query<RecordingRow>(
    `INSERT INTO recordings (id, robot_id, started_at, storage_prefix)
     VALUES ($1, $2, NOW(), $3)
     RETURNING *`,
    [recordingId, robotId, storagePrefix]
  );
  return result.rows[0];
}

export async function finishRecording(recordingId: string) {
  await pool.query(
    `UPDATE recordings
     SET ended_at = COALESCE(ended_at, NOW()),
         status = 'completed',
         updated_at = NOW()
     WHERE id = $1`,
    [recordingId]
  );
}

export async function appendRecordingStats(recordingId: string, sensorTypes: string[], byteSize: number) {
  await pool.query(
    `UPDATE recordings
     SET sensor_types = ARRAY(
           SELECT DISTINCT UNNEST(COALESCE(sensor_types, ARRAY[]::TEXT[]) || $2::TEXT[])
         ),
         file_size_bytes = file_size_bytes + $3,
         updated_at = NOW()
     WHERE id = $1`,
    [recordingId, sensorTypes, byteSize]
  );
}

export async function insertChunk(params: {
  recordingId: string;
  robotId: string;
  sensorType: string;
  startedAt: string;
  endedAt: string;
  messageCount: number;
  byteSize: number;
  objectKey: string;
  contentEncoding: string;
}) {
  const chunkId = ulid();
  await pool.query(
    `INSERT INTO sensor_chunks (
      id, recording_id, robot_id, sensor_type, started_at, ended_at,
      message_count, byte_size, object_key, content_encoding
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      chunkId,
      params.recordingId,
      params.robotId,
      params.sensorType,
      params.startedAt,
      params.endedAt,
      params.messageCount,
      params.byteSize,
      params.objectKey,
      params.contentEncoding
    ]
  );
  return chunkId;
}

export async function insertSensorEvents(recordingId: string, robotId: string, chunkId: string, events: SensorEventInput[]) {
  const values: Array<string | number | boolean> = [];
  const placeholders = events.map((event, index) => {
    const offset = index * 7;
    values.push(recordingId, robotId, event.sensorType, event.timestamp, event.sequence, event.anomaly ?? false, JSON.stringify(event.payload));
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}::jsonb, '${chunkId}')`;
  });

  await pool.query(
    `INSERT INTO sensor_events (
      recording_id, robot_id, sensor_type, ts, sequence, anomaly, payload, chunk_id
    ) VALUES ${placeholders.join(', ')}`,
    values
  );
}

export async function listRobots() {
  const result = await pool.query<RobotRow>(
    `SELECT robot_id, name, location, status, metadata, last_seen_at
     FROM robots
     ORDER BY robot_id ASC`
  );
  return result.rows;
}

export async function getRobotLiveStatus(robotId: string) {
  const result = await pool.query<RobotRow>(
    `SELECT robot_id, name, location, status, metadata, last_seen_at
     FROM robots
     WHERE robot_id = $1`,
    [robotId]
  );
  return result.rows[0] ?? null;
}

export async function listRecordings(filters: {
  robotId?: string;
  sensorType?: string;
  from?: string;
  to?: string;
  anomalyOnly?: boolean;
  limit: number;
}) {
  const clauses = ['1 = 1'];
  const values: Array<string | number | boolean> = [];

  if (filters.robotId) {
    values.push(filters.robotId);
    clauses.push(`recordings.robot_id = $${values.length}`);
  }

  if (filters.sensorType) {
    values.push(filters.sensorType);
    clauses.push(`$${values.length} = ANY(recordings.sensor_types)`);
  }

  if (filters.from) {
    values.push(filters.from);
    clauses.push(`recordings.started_at >= $${values.length}`);
  }

  if (filters.to) {
    values.push(filters.to);
    clauses.push(`COALESCE(recordings.ended_at, NOW()) <= $${values.length}`);
  }

  if (filters.anomalyOnly) {
    clauses.push(`EXISTS (
      SELECT 1 FROM sensor_events
      WHERE sensor_events.recording_id = recordings.id
      AND sensor_events.anomaly = TRUE
    )`);
  }

  values.push(filters.limit);

  const result = await pool.query(
    `SELECT recordings.*,
            robots.name AS robot_name,
            robots.location AS robot_location
     FROM recordings
     JOIN robots ON robots.robot_id = recordings.robot_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY recordings.started_at DESC
     LIMIT $${values.length}`,
    values
  );

  return result.rows;
}

export async function listReplayEvents(filters: {
  recordingIds: string[];
  sensorTypes?: string[];
  startTime?: string;
  endTime?: string;
}) {
  const values: Array<string | string[]> = [filters.recordingIds];
  const clauses = ['recording_id = ANY($1::text[])'];

  if (filters.sensorTypes?.length) {
    values.push(filters.sensorTypes);
    clauses.push(`sensor_type = ANY($${values.length}::text[])`);
  }

  if (filters.startTime) {
    values.push(filters.startTime);
    clauses.push(`ts >= $${values.length}`);
  }

  if (filters.endTime) {
    values.push(filters.endTime);
    clauses.push(`ts <= $${values.length}`);
  }

  const result = await pool.query<EventRow>(
    `SELECT id, recording_id, robot_id, sensor_type, ts, sequence, anomaly, payload
     FROM sensor_events
     WHERE ${clauses.join(' AND ')}
     ORDER BY ts ASC, sequence ASC`,
    values
  );

  return result.rows;
}

export async function getRecording(recordingId: string) {
  const result = await pool.query<RecordingRow>(
    `SELECT * FROM recordings WHERE id = $1`,
    [recordingId]
  );
  return result.rows[0] ?? null;
}

