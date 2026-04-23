import { gzipSync } from 'node:zlib';
import type { Server as HttpServer } from 'node:http';
import { WebSocketServer } from 'ws';
import type WebSocket from 'ws';
import {
  appendRecordingStats,
  createRecording,
  finishRecording,
  insertChunk,
  insertSensorEvents,
  updateRobotStatus,
  upsertRobot
} from './db.js';
import { LiveHub } from './liveHub.js';
import { createArchiveStorage } from './storage.js';
import {
  ingestBatchSchema,
  registerMessageSchema,
  type LiveTelemetryEvent,
  type RobotRegistration,
  type SensorEventInput
} from './types.js';

const storage = createArchiveStorage();

function groupBySensorType(events: SensorEventInput[]) {
  const groups = new Map<string, SensorEventInput[]>();
  for (const event of events) {
    const current = groups.get(event.sensorType) ?? [];
    current.push(event);
    groups.set(event.sensorType, current);
  }
  return groups;
}

export function createWebSocketLayer(server: HttpServer, liveHub: LiveHub) {
  const ingestServer = new WebSocketServer({ noServer: true });
  const liveServer = new WebSocketServer({ noServer: true });
  const connectionState = new WeakMap<WebSocket, { robot?: RobotRegistration; recordingId?: string }>();

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;

    if (pathname === '/ws/ingest') {
      ingestServer.handleUpgrade(request, socket, head, (websocket) => {
        ingestServer.emit('connection', websocket, request);
      });
      return;
    }

    if (pathname === '/ws/live') {
      liveServer.handleUpgrade(request, socket, head, (websocket) => {
        liveServer.emit('connection', websocket, request);
      });
      return;
    }

    socket.destroy();
  });

  ingestServer.on('connection', (socket) => {
    connectionState.set(socket, {});

    socket.on('message', async (raw) => {
      try {
        const parsed = JSON.parse(raw.toString()) as Record<string, unknown>;

        if (parsed.type === 'register') {
          const message = registerMessageSchema.parse(parsed);
          await upsertRobot(message.robot);
          await updateRobotStatus(message.robot.robotId, 'online');
          const recording = await createRecording(message.robot.robotId);
          connectionState.set(socket, { robot: message.robot, recordingId: recording.id });
          liveHub.upsertRobot(message.robot, recording.id);
          socket.send(JSON.stringify({ type: 'registered', recordingId: recording.id }));
          return;
        }

        if (parsed.type === 'ingest.batch') {
          const message = ingestBatchSchema.parse(parsed);
          await upsertRobot(message.robot);
          await updateRobotStatus(message.robot.robotId, 'online');
          const currentState = connectionState.get(socket) ?? {};
          let recordingId = message.recordingId ?? currentState.recordingId;
          if (!recordingId) {
            const recording = await createRecording(message.robot.robotId);
            recordingId = recording.id;
          }
          if (!recordingId) {
            throw new Error('Failed to resolve recordingId');
          }
          const resolvedRecordingId = recordingId;
          connectionState.set(socket, { robot: message.robot, recordingId: resolvedRecordingId });
          liveHub.upsertRobot(message.robot, resolvedRecordingId);

          const groups = groupBySensorType(message.events);
          for (const [sensorType, events] of groups.entries()) {
            if (!events.length) {
              continue;
            }
            const payload = Buffer.from(events.map((event) => JSON.stringify({
              recordingId: resolvedRecordingId,
              robotId: message.robot.robotId,
              ...event
            })).join('\n'));
            const compressed = gzipSync(payload);
            const startedAt = events[0].timestamp;
            const endedAt = events[events.length - 1].timestamp;
            const objectKey = `${message.robot.robotId}/${resolvedRecordingId}/${sensorType}/${Date.now()}.jsonl.gz`;
            const stored = await storage.putObject(objectKey, compressed, 'application/x-ndjson');
            const chunkId = await insertChunk({
              recordingId: resolvedRecordingId,
              robotId: message.robot.robotId,
              sensorType,
              startedAt,
              endedAt,
              messageCount: events.length,
              byteSize: stored.byteSize,
              objectKey: stored.objectKey,
              contentEncoding: 'gzip'
            });
            await insertSensorEvents(resolvedRecordingId, message.robot.robotId, chunkId, events);
            await appendRecordingStats(resolvedRecordingId, [sensorType], stored.byteSize);
          }

          for (const event of message.events) {
            const liveEvent: LiveTelemetryEvent = {
              robotId: message.robot.robotId,
              recordingId: resolvedRecordingId,
              sensorType: event.sensorType,
              timestamp: event.timestamp,
              sequence: event.sequence,
              anomaly: event.anomaly ?? false,
              payload: event.payload
            };
            liveHub.publish(liveEvent, message.robot);
          }

          socket.send(JSON.stringify({ type: 'ingest.ack', accepted: message.events.length, recordingId: resolvedRecordingId }));
        }
      } catch (error) {
        socket.send(JSON.stringify({
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown ingest error'
        }));
      }
    });

    socket.on('close', async () => {
      const state = connectionState.get(socket);
      if (!state?.robot) {
        return;
      }

      await updateRobotStatus(state.robot.robotId, 'offline');
      liveHub.markOffline(state.robot.robotId);
      if (state.recordingId) {
        await finishRecording(state.recordingId);
      }
    });
  });

  liveServer.on('connection', (socket) => {
    liveHub.subscribe(socket);
    socket.on('close', () => {
      liveHub.unsubscribe(socket);
    });
  });
}





