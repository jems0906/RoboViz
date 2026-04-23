# RoboViz API Documentation

## Overview

RoboViz ingests live sensor data from robots, stores it in a queryable index, and provides APIs for live telemetry, recording search, replay, and dataset export.

## WebSocket Endpoints

### `/ws/ingest`

On-device agents use this endpoint to send batched sensor events.

**Message: Register**
```json
{
  "type": "register",
  "robot": {
    "robotId": "robot-01",
    "name": "Scout Robot",
    "location": "warehouse-a",
    "status": "online",
    "metadata": { "firmware": "v1.2.3" }
  }
}
```

**Message: Ingest Batch**
```json
{
  "type": "ingest.batch",
  "robot": { "robotId": "...", ... },
  "recordingId": "optional-id-to-continue",
  "events": [
    {
      "sensorType": "camera",
      "timestamp": "2026-04-21T10:30:45.123Z",
      "sequence": 100,
      "anomaly": false,
      "payload": { "imageBase64": "...", "width": 640, "height": 480 }
    },
    {
      "sensorType": "lidar",
      "timestamp": "2026-04-21T10:30:45.145Z",
      "sequence": 50,
      "anomaly": false,
      "payload": { "points": [{ "x": 1.5, "y": 2.3, "z": 0.8, "intensity": 0.6 }, ...] }
    }
  ]
}
```

**Response**
```json
{
  "type": "ingest.ack",
  "accepted": 2,
  "recordingId": "rec-uuid"
}
```

### `/ws/live`

Clients subscribe to live telemetry snapshots for connected robots.

**Subscription Message**
```json
{
  "type": "live.snapshot",
  "robots": [
    {
      "robot": { "robotId": "robot-01", "name": "Scout", "status": "online", ... },
      "recordingId": "rec-uuid",
      "lastUpdatedAt": "2026-04-21T10:30:45.123Z",
      "sensors": {
        "camera": { "robotId": "...", "recordingId": "...", "sensorType": "camera", ... },
        "lidar": { "robotId": "...", "recordingId": "...", "sensorType": "lidar", ... }
      }
    }
  ]
}
```

## REST Endpoints

### `GET /health`
Health check.

**Response**
```json
{ "ok": true, "service": "roboviz-api" }
```

### `GET /api/robots`
List all registered robots.

**Response**
```json
{
  "robots": [
    {
      "robot_id": "robot-01",
      "name": "Scout Robot",
      "location": "warehouse-a",
      "status": "online",
      "metadata": { "battery_pct": 87.5 },
      "last_seen_at": "2026-04-21T10:30:45.123Z"
    }
  ]
}
```

### `GET /api/robots/:robotId/telemetry`
Get the current live status of a specific robot.

**Response**
```json
{
  "robot": { "robot_id": "...", "name": "...", "status": "online", ... }
}
```

### `GET /api/recordings`

Query indexed recordings.

**Query Parameters**
- `robotId` (optional): Filter by robot ID
- `sensorType` (optional): Filter by sensor type
- `from` (optional): ISO datetime start
- `to` (optional): ISO datetime end
- `anomalyOnly` (optional): `true` to show only recordings with anomalies
- `limit` (optional): Max results, default 100

**Response**
```json
{
  "recordings": [
    {
      "id": "rec-uuid",
      "robot_id": "robot-01",
      "robot_name": "Scout Robot",
      "robot_location": "warehouse-a",
      "started_at": "2026-04-21T10:00:00Z",
      "ended_at": "2026-04-21T10:30:00Z",
      "sensor_types": ["camera", "lidar", "imu", "odometry"],
      "file_size_bytes": 15728640,
      "status": "completed",
      "storage_prefix": "robot-01/rec-uuid"
    }
  ]
}
```

### `GET /api/recordings/:recordingId`
Get metadata for a specific recording.

**Response**
```json
{
  "recording": { "id": "...", "robot_id": "...", ... }
}
```

### `GET /api/replay/events`

Retrieve indexed events for replay.

**Query Parameters**
- `recordingIds` (required): Comma-separated recording IDs
- `sensorTypes` (optional): Comma-separated sensor types
- `startTime` (optional): ISO datetime
- `endTime` (optional): ISO datetime

**Response**
```json
{
  "events": [
    {
      "id": 12345,
      "recording_id": "rec-uuid",
      "robot_id": "robot-01",
      "sensor_type": "camera",
      "ts": "2026-04-21T10:00:05.123Z",
      "sequence": "100",
      "anomaly": false,
      "payload": { "imageBase64": "...", "width": 640, "height": 480 }
    }
  ]
}
```

### `POST /api/exports/:recordingId`

Export a recording in a specified format.

**Request Body**
```json
{
  "format": "jsonl" | "parquet" | "tfrecord"
}
```

**Response (JSONL/TFRecord)**
Binary stream - save as `.jsonl` or `.tfrecord` file.

**Response (Parquet)**
```json
{
  "format": "parquet",
  "filePath": "/app/artifacts/rec-uuid.parquet",
  "compressedBytes": 1024
}
```

## Event Types

### Camera
```json
{
  "sensorType": "camera",
  "payload": {
    "imageBase64": "...",
    "width": 640,
    "height": 480
  }
}
```

### Lidar
```json
{
  "sensorType": "lidar",
  "payload": {
    "points": [
      { "x": 1.5, "y": 2.3, "z": 0.8, "intensity": 0.6 }
    ]
  }
}
```

### IMU
```json
{
  "sensorType": "imu",
  "payload": {
    "roll": 0.01,
    "pitch": -0.02,
    "yaw": 0.5,
    "ax": 0.1,
    "ay": 0.2,
    "az": 9.81
  }
}
```

### Odometry
```json
{
  "sensorType": "odometry",
  "payload": {
    "x": 10.5,
    "y": 20.3,
    "theta": 1.57,
    "velocity": 0.5
  }
}
```

## Error Handling

All errors return a JSON error object:

```json
{
  "error": "Descriptive error message"
}
```

Common HTTP status codes:
- `200` - Success
- `400` - Bad request (malformed data)
- `404` - Not found (recording, robot, etc.)
- `500` - Server error
