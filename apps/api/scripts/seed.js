#!/usr/bin/env node

import { Pool } from 'pg';
import { config } from './src/config.js';

async function seed() {
  const pool = new Pool({ connectionString: config.databaseUrl });

  try {
    console.log('Seeding database...');

    await pool.query(`
      INSERT INTO robots (robot_id, name, location, status, metadata, last_seen_at)
      VALUES 
        ('robot-warehouse-01', 'Warehouse Scout A', 'dock-a', 'online', '{"battery_pct": 92, "firmware": "v1.2.3"}'::jsonb, NOW()),
        ('robot-warehouse-02', 'Warehouse Scout B', 'dock-b', 'offline', '{"battery_pct": 0, "firmware": "v1.2.2"}'::jsonb, NOW() - interval '2 hours'),
        ('robot-factory-01', 'Factory Inspector', 'assembly-line', 'online', '{"battery_pct": 78, "firmware": "v2.0.1"}'::jsonb, NOW())
      ON CONFLICT (robot_id) DO NOTHING
    `);

    console.log('✓ Seeded robots');

    const recordingResult = await pool.query(
      `INSERT INTO recordings (id, robot_id, started_at, ended_at, sensor_types, file_size_bytes, status, storage_prefix)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        'rec-demo-001',
        'robot-warehouse-01',
        new Date(Date.now() - 86400000),
        new Date(Date.now() - 82800000),
        ['camera', 'lidar', 'imu', 'odometry'],
        52428800,
        'completed',
        'robot-warehouse-01/rec-demo-001'
      ]
    );

    console.log('✓ Seeded recordings');

    const recordingId = recordingResult.rows[0].id;

    const events = [];
    for (let i = 0; i < 100; i++) {
      events.push([
        recordingId,
        'robot-warehouse-01',
        'camera',
        new Date(Date.now() - 86400000 + i * 1000),
        i,
        Math.random() > 0.95,
        JSON.stringify({ width: 640, height: 480, format: 'png' })
      ]);
    }

    for (const event of events) {
      await pool.query(
        `INSERT INTO sensor_events (recording_id, robot_id, sensor_type, ts, sequence, anomaly, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        event
      );
    }

    console.log('✓ Seeded sensor events');
    console.log('\nDatabase seeding complete!');
  } finally {
    await pool.end();
  }
}

seed().catch((error) => {
  console.error('Seeding failed:', error);
  process.exitCode = 1;
});
