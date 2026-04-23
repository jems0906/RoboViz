import type WebSocket from 'ws';
import type { LiveTelemetryEvent, RobotRegistration } from './types.js';

type RobotSnapshot = {
  robot: RobotRegistration;
  recordingId: string;
  lastUpdatedAt: string;
  sensors: Partial<Record<LiveTelemetryEvent['sensorType'], LiveTelemetryEvent>>;
};

export class LiveHub {
  private subscribers = new Set<WebSocket>();
  private snapshots = new Map<string, RobotSnapshot>();

  subscribe(socket: WebSocket) {
    this.subscribers.add(socket);
    socket.send(JSON.stringify({
      type: 'live.snapshot',
      robots: Array.from(this.snapshots.values())
    }));
  }

  unsubscribe(socket: WebSocket) {
    this.subscribers.delete(socket);
  }

  upsertRobot(robot: RobotRegistration, recordingId: string) {
    const current = this.snapshots.get(robot.robotId);
    this.snapshots.set(robot.robotId, {
      robot,
      recordingId,
      lastUpdatedAt: new Date().toISOString(),
      sensors: current?.sensors ?? {}
    });

    this.broadcast({
      type: 'robot.presence',
      robot: this.snapshots.get(robot.robotId)
    });
  }

  publish(event: LiveTelemetryEvent, robot: RobotRegistration) {
    const snapshot = this.snapshots.get(robot.robotId) ?? {
      robot,
      recordingId: event.recordingId,
      lastUpdatedAt: event.timestamp,
      sensors: {}
    };

    snapshot.robot = robot;
    snapshot.recordingId = event.recordingId;
    snapshot.lastUpdatedAt = event.timestamp;
    snapshot.sensors[event.sensorType] = event;
    this.snapshots.set(robot.robotId, snapshot);

    this.broadcast({
      type: 'live.telemetry',
      event,
      snapshot
    });
  }

  markOffline(robotId: string) {
    const snapshot = this.snapshots.get(robotId);
    if (!snapshot) {
      return;
    }

    snapshot.robot = { ...snapshot.robot, status: 'offline' };
    snapshot.lastUpdatedAt = new Date().toISOString();
    this.snapshots.set(robotId, snapshot);

    this.broadcast({
      type: 'robot.presence',
      robot: snapshot
    });
  }

  private broadcast(payload: unknown) {
    const body = JSON.stringify(payload);
    for (const socket of this.subscribers) {
      if (socket.readyState === socket.OPEN) {
        socket.send(body);
      }
    }
  }
}
