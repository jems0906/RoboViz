export type SensorType = 'camera' | 'lidar' | 'imu' | 'odometry';

export type RobotSummary = {
  robot_id: string;
  name: string;
  location: string;
  status: 'online' | 'offline' | 'degraded';
  metadata: Record<string, unknown>;
  last_seen_at: string | null;
};

export type RecordingSummary = {
  id: string;
  robot_id: string;
  robot_name: string;
  robot_location: string;
  started_at: string;
  ended_at: string | null;
  sensor_types: string[];
  file_size_bytes: number;
  status: string;
  storage_prefix: string;
};

export type ReplayEvent = {
  id: number;
  recording_id: string;
  robot_id: string;
  sensor_type: SensorType;
  ts: string;
  sequence: string;
  anomaly: boolean;
  payload: Record<string, unknown>;
};

export type LiveTelemetryEvent = {
  robotId: string;
  recordingId: string;
  sensorType: SensorType;
  timestamp: string;
  sequence: number;
  anomaly: boolean;
  payload: Record<string, unknown>;
};

export type LiveRobotSnapshot = {
  robot: {
    robotId: string;
    name: string;
    location: string;
    status: 'online' | 'offline' | 'degraded';
    metadata?: Record<string, unknown>;
  };
  recordingId: string;
  lastUpdatedAt: string;
  sensors: Partial<Record<SensorType, LiveTelemetryEvent>>;
};
