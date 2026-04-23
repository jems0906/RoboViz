# RoboViz Architecture

## System Overview

RoboViz is a distributed system for real-time robot observability consisting of three main components:

1. **On-Device Agent (Python)**: Runs on robots to collect sensor data and transmit it
2. **Cloud Ingestion Service (Node.js/TypeScript)**: Receives, processes, and indexes sensor streams
3. **Web Dashboard (React/TypeScript)**: Visualizes live telemetry and replays historical recordings

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         RoboViz Data Pipeline                    │
└─────────────────────────────────────────────────────────────────┘

On-Device Layer:
┌──────────────────────────────────────────────────────────────────┐
│  Robot Hardware                                                   │
│  ├─ Camera       │ Lidar      │ IMU        │ Odometry            │
│  └────────────────────────────────────────────────────────────────┘
          │                │              │           │
          └────────────────┴──────────────┴───────────┘
                           │
          ┌────────────────▼────────────────┐
          │   Python Agent                  │
          │  • Sensor Collection            │
          │  • Local Buffering (5K queue)   │
          │  • Batch Assembly (250 events)  │
          │  • Network Resilience           │
          └────────────────┬────────────────┘
                           │
                    WebSocket Batch
                  [Camera: 2.4MB/s]
                  [Lidar:  1.8MB/s]
                  [IMU:    0.2MB/s]
                  [Odo:    0.1MB/s]
                           │
Cloud Ingestion Layer:     │
┌──────────────────────────▼────────────────────────────────────────┐
│   API Server (Node.js + Express)                                  │
│  ├─ WebSocket Ingest Handler                                      │
│  │   • Message Validation (Zod schema)                            │
│  │   • Robot Registry Updates                                      │
│  │   • Event Grouping by Sensor                                    │
│  │                                                                  │
│  ├─ Archive Storage Layer                                          │
│  │   ├─ Filesystem (local development)                             │
│  │   └─ S3-Compatible (MinIO, AWS)                                 │
│  │       • Compression (gzip)                                      │
│  │       • Chunking by Sensor Type                                 │
│  │       • Content Hashing (CRC32C)                                │
│  │                                                                  │
│  └─ Indexing Layer (PostgreSQL)                                    │
│      ├─ Robot Registry (status, location)                          │
│      ├─ Recording Metadata (duration, sensors)                     │
│      ├─ Chunk Metadata (offset, size, encoding)                    │
│      └─ Event Index (timestamp, sequence, flags)                   │
└──────────────────┬───────────────────────────────────────────────┘
                   │
         ┌─────────┼──────────┬─────────┐
         │         │          │         │
    REST API   REST API  WebSocket  WebSocket
    (Recordings)(Export) (Live)     (Replay)
         │         │          │         │
Presentation Layer:│         │         │
    ┌─────────────▼─────────▼────────▼───────────┐
    │    React Dashboard (Vite)                   │
    │  ├─ Fleet Status Panel                      │
    │  │  • Robot Registry View                   │
    │  │  • Status Indicators                     │
    │  │  • Last Seen Tracking                    │
    │  │                                           │
    │  ├─ Live Telemetry                          │
    │  │  • WebSocket Subscription                │
    │  │  • 3D Lidar Rendering (Three.js)         │
    │  │  • Camera Frame Sync                     │
    │  │  • IMU/Odometry Gauges                   │
    │  │                                           │
    │  ├─ Recording Search                        │
    │  │  • Temporal Range Filters                │
    │  │  • Sensor Type Filters                   │
    │  │  • Anomaly Search                        │
    │  │  • Result Pagination                     │
    │  │                                           │
    │  ├─ Synchronized Replay                     │
    │  │  • Multi-Recording Timeline              │
    │  │  • Local Playback Control                │
    │  │  • Variable Speed Scrubbing              │
    │  │  • Sensor-Specific Filters               │
    │  │                                           │
    │  └─ Dataset Export                          │
    │     • JSONL Export                          │
    │     • Parquet Format (for ML pipelines)     │
    │     • TFRecord Format (TensorFlow)          │
    └──────────────────────────────────────────────┘
```

## Component Details

### 1. On-Device Agent (Python)

**Location**: `agents/python-agent/agent.py`

**Responsibilities**:
- Collect raw sensor data from hardware interfaces
- Buffer events locally (queue size limit: 5000)
- Batch assembly and serialization
- Transmission via WebSocket with reconnect logic
- Graceful handling of network dropouts

**Key Features**:
- Async event loop with separate producer tasks per sensor type
- Configurable batch flush interval (default: 0.2s)
- Exponential backoff reconnection (max 10s)
- Local queue prevents data loss during transient outages
- Metadata enrichment (battery level, firmware version)

**Sensor Intervals**:
```
Camera:    0.4s (2.5 Hz)
Lidar:     0.15s (~6.7 Hz)
IMU:       0.05s (20 Hz)
Odometry:  0.1s (10 Hz)
```

**Estimated Throughput**:
- Per robot: ~30-50 MB/hour
- 10 robots: ~300-500 MB/hour
- 100 robots: ~3-5 GB/hour

### 2. Cloud Ingestion Service

**Location**: `apps/api/`

**Architecture Layers**:

#### a) WebSocket Handler (`src/websocket.ts`)
- Dual server endpoints: `/ws/ingest` and `/ws/live`
- Per-connection state tracking (robot metadata, recording ID)
- Message validation using Zod schemas
- Automatic recording creation on first ingest
- Connection lifecycle management (register → ingest → close)

#### b) Event Processing Pipeline
```
Ingest Batch Message
    ↓
[Validation] (Zod schema)
    ↓
[Robot Upsert] (Registry update)
    ↓
[Event Grouping] (By sensor type)
    ↓
[Compression] (gzip JSONL per sensor)
    ↓
[Storage] (Filesystem or S3)
    ↓
[Indexing] (Postgres event inserts)
    ↓
[Live Broadcasting] (WebSocket snapshot)
```

#### c) Storage Layer (`src/storage.ts`)
- **Filesystem mode**: Direct local path writing
- **S3 mode**: MinIO or AWS S3 with multipart upload
- Object naming: `{robotId}/{recordingId}/{sensorType}/{timestamp}.jsonl.gz`
- Chunk metadata stored in Postgres
- CRC32C checksums for data integrity

#### d) Index Layer (`src/db.ts`)
**Postgres Schema**:
- `robots` (robot registry + status)
- `recordings` (recording metadata + duration)
- `sensor_chunks` (chunk references + stats)
- `sensor_events` (indexed individual events)

**Key Indexes**:
- `idx_recordings_robot_started_at` (query by robot/time)
- `idx_sensor_events_robot_ts` (live telemetry lookup)
- `idx_sensor_events_recording_ts` (replay queries)
- `idx_sensor_events_anomaly` (anomaly filtering)

### 3. Web Dashboard

**Location**: `apps/web/`

**Main Components**:

#### a) API Client (`src/api.ts`)
- Handles both REST and WebSocket connections
- Smart URL construction for WebSocket (handles reverse proxy scenarios)
- Parallel API calls (robots + recordings loaded together)
- Blob/JSON response handling for exports

#### b) Live Telemetry View
- WebSocket subscription to `/ws/live`
- Snapshot updates with latest sensor readings
- Robot presence tracking
- Status indicators (online/offline/degraded)

#### c) 3D Visualization (`src/PointCloudView.tsx`)
- Three.js scene with WebGL rendering
- Real-time point cloud updates
- Grid helper for spatial reference
- Animated camera orbit
- Color coding by lidar intensity

#### d) Replay System
```
┌──────────────────────────────────┐
│  Replay State Machine            │
├──────────────────────────────────┤
│  events: ReplayEvent[]           │
│  cursorMs: number                │
│  durationMs: number              │
│  speed: 0.25-4x                  │
│  isPlaying: boolean              │
└──────────────────────────────────┘
          │
    Uses requestAnimationFrame
    for frame-rate-independent
    timeline advancement
```

- Local event merging by timestamp
- Variable playback speed (0.25x - 4x)
- Timeline scrubbing
- Multi-recording sync

#### e) Recording Search
- Temporal filters (date range)
- Sensor type filtering
- Anomaly-only view
- Pagination (limit 200)
- Selection for replay/export

#### f) Export Features
- **JSONL**: Standard JSON Lines format
- **Parquet**: Apache Parquet for ML pipelines
- **TFRecord**: TensorFlow-compatible format

## Key Technologies

| Layer | Component | Tech Stack |
|-------|-----------|-----------|
| On-Device | Sensor Agent | Python 3.11+, websockets, Pillow |
| Cloud Ingest | API Server | Node.js 20, Express, ws, Zod |
| Persistence | Database | PostgreSQL 16 with JSON queries |
| Storage | Archive Backend | Filesystem or S3-compatible (MinIO) |
| Frontend | Dashboard | React 19, Vite, Three.js |
| Infrastructure | Orchestration | Docker Compose (local), Kubernetes (production) |

## Performance Characteristics

### Latency Targets
- Event ingest to index: **<50ms**
- Live telemetry broadcast: **<100ms**
- Replay event query: **<200ms** (per 1000 events)
- Dashboard refresh: **<500ms**

### Throughput Targets
- Single robot: **100K+ messages/min** (aggressive)
- Fleet (10 robots): **1M messages/min**
- Fleet (100 robots): **10M messages/min**

### Storage Efficiency
- Raw sensor data: **~50-80 MB/hour/robot**
- Compressed archive: **~5-10 MB/hour/robot** (gzip)
- Index overhead: **~100 bytes/event**

## Scaling Strategy

### Horizontal Scaling
1. **API Instances**: Run multiple API containers behind load balancer
2. **Database**: PostgreSQL replication with read replicas for queries
3. **Archive Storage**: S3 sharding by robot ID or time range
4. **WebSocket Servers**: Use sticky sessions or Redis pub/sub for broadcasts

### Vertical Scaling
1. **Database**: Upgrade PostgreSQL instance size
2. **API Memory**: Increase buffer pool sizes
3. **Storage**: Use higher-throughput storage backends

### Data Retention
- Keep live events in PostgreSQL for **30 days**
- Archive to cold storage for historical access
- Implement retention policies by robot or age

## Security Considerations

1. **Authentication**: TLS/mTLS for WebSocket and REST
2. **Authorization**: Robot-scoped data access
3. **Input Validation**: Zod schemas for all endpoints
4. **Rate Limiting**: Per-robot ingest quotas
5. **Audit Logging**: All access and modifications
6. **Secrets**: Environment variables for credentials

## Deployment Options

### Local Development
- Docker Compose with embedded Postgres + MinIO
- Hot reload for API and dashboard
- Simulator agents for testing

### Production (Kubernetes)
- Helm charts for reproducible deployments
- PostgreSQL operator for high availability
- S3 object storage for archives
- Prometheus + Grafana for monitoring

### Edge (Embedded)
- Python agent runs on Raspberry Pi or similar
- Handles local sensor collection and buffering
- Transmits to cloud via cellular/WiFi
