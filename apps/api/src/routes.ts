import { gzipSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import Parquet from 'parquetjs-lite';
import crc32c from 'fast-crc32c';
import {
  getRecording,
  getRobotLiveStatus,
  listRecordings,
  listReplayEvents,
  listRobots
} from './db.js';
import { config } from './config.js';
import { replayQuerySchema } from './types.js';

function buildTfRecord(records: Buffer[]) {
  const chunks: Buffer[] = [];
  for (const record of records) {
    const lengthBuffer = Buffer.alloc(8);
    lengthBuffer.writeBigUInt64LE(BigInt(record.byteLength));
    const lengthCrc = maskCrc32c(crc32c.calculate(lengthBuffer));
    const dataCrc = maskCrc32c(crc32c.calculate(record));
    const lengthCrcBuffer = Buffer.alloc(4);
    const dataCrcBuffer = Buffer.alloc(4);
    lengthCrcBuffer.writeUInt32LE(lengthCrc);
    dataCrcBuffer.writeUInt32LE(dataCrc);
    chunks.push(lengthBuffer, lengthCrcBuffer, record, dataCrcBuffer);
  }
  return Buffer.concat(chunks);
}

function maskCrc32c(crc: number) {
  return (((crc >>> 15) | (crc << 17)) + 0xa282ead8) >>> 0;
}

export function createRoutes() {
  const router = Router();

  router.get('/health', (_request, response) => {
    response.json({ ok: true, service: 'roboviz-api' });
  });

  router.get('/api/robots', async (_request, response, next) => {
    try {
      const robots = await listRobots();
      response.json({ robots });
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/robots/:robotId/telemetry', async (request, response, next) => {
    try {
      const robot = await getRobotLiveStatus(request.params.robotId);
      if (!robot) {
        response.status(404).json({ error: 'Robot not found' });
        return;
      }
      response.json({ robot });
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/recordings', async (request, response, next) => {
    try {
      const recordings = await listRecordings({
        robotId: typeof request.query.robotId === 'string' ? request.query.robotId : undefined,
        sensorType: typeof request.query.sensorType === 'string' ? request.query.sensorType : undefined,
        from: typeof request.query.from === 'string' ? request.query.from : undefined,
        to: typeof request.query.to === 'string' ? request.query.to : undefined,
        anomalyOnly: request.query.anomalyOnly === 'true',
        limit: Number.parseInt(typeof request.query.limit === 'string' ? request.query.limit : '100', 10)
      });
      response.json({ recordings });
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/recordings/:recordingId', async (request, response, next) => {
    try {
      const recording = await getRecording(request.params.recordingId);
      if (!recording) {
        response.status(404).json({ error: 'Recording not found' });
        return;
      }
      response.json({ recording });
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/replay/events', async (request, response, next) => {
    try {
      const recordingIds = typeof request.query.recordingIds === 'string'
        ? request.query.recordingIds.split(',').filter(Boolean)
        : [];
      const sensorTypes = typeof request.query.sensorTypes === 'string'
        ? request.query.sensorTypes.split(',').filter(Boolean)
        : undefined;

      const query = replayQuerySchema.parse({
        recordingIds,
        sensorTypes,
        startTime: typeof request.query.startTime === 'string' ? request.query.startTime : undefined,
        endTime: typeof request.query.endTime === 'string' ? request.query.endTime : undefined
      });

      const events = await listReplayEvents(query);
      response.json({ events });
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/exports/:recordingId', async (request, response, next) => {
    try {
      const recordingId = request.params.recordingId;
      const format = request.body?.format ?? 'jsonl';
      const events = await listReplayEvents({ recordingIds: [recordingId] });

      if (!events.length) {
        response.status(404).json({ error: 'No events found for export' });
        return;
      }

      if (format === 'jsonl') {
        const body = events.map((event: unknown) => JSON.stringify(event)).join('\n');
        response.setHeader('Content-Type', 'application/x-ndjson');
        response.setHeader('Content-Disposition', `attachment; filename="${recordingId}.jsonl"`);
        response.send(body);
        return;
      }

      if (format === 'parquet') {
        const schema = new Parquet.ParquetSchema({
          recording_id: { type: 'UTF8' },
          robot_id: { type: 'UTF8' },
          sensor_type: { type: 'UTF8' },
          ts: { type: 'TIMESTAMP_MILLIS' },
          sequence: { type: 'INT64' },
          anomaly: { type: 'BOOLEAN' },
          payload_json: { type: 'UTF8' }
        });

        const exportDir = config.exportPath;
        await mkdir(exportDir, { recursive: true });
        const parquetPath = path.join(exportDir, `${recordingId}.parquet`);
        const writer = await Parquet.ParquetWriter.openFile(schema, parquetPath);
        for (const event of events) {
          await writer.appendRow({
            recording_id: event.recording_id,
            robot_id: event.robot_id,
            sensor_type: event.sensor_type,
            ts: new Date(event.ts),
            sequence: Number(event.sequence),
            anomaly: event.anomaly,
            payload_json: JSON.stringify(event.payload)
          });
        }
        await writer.close();

        response.json({
          format,
          filePath: parquetPath,
          compressedBytes: gzipSync(Buffer.from(JSON.stringify({ count: events.length }))).byteLength
        });
        return;
      }

      if (format === 'tfrecord') {
        const records = events.map((event: unknown) => Buffer.from(JSON.stringify(event)));
        const tfrecord = buildTfRecord(records);
        response.setHeader('Content-Type', 'application/octet-stream');
        response.setHeader('Content-Disposition', `attachment; filename="${recordingId}.tfrecord"`);
        response.send(tfrecord);
        return;
      }

      response.status(400).json({ error: 'Unsupported export format' });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

