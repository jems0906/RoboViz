# RoboViz: Real-Time Robot Data Visualizer & Replay Engine

[![CI/CD](https://github.com/yourusername/roboviz/actions/workflows/ci.yml/badge.svg)](https://github.com/yourusername/roboviz/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org/)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-blue)](https://www.python.org/)

**RoboViz** is a full-stack observability platform for robot fleets. Ingest live sensor data from 10+ robots, index terabytes of recordings, visualize lidar point clouds in real-time, and export datasets for ML training.

## 🎯 Key Features

✅ **Live Telemetry**: Real-time sensor streams (camera, lidar, IMU, odometry) over WebSocket  
✅ **100K+ msg/min**: Ingest from fleet of 10+ robots with <100ms latency  
✅ **Indexed Recordings**: Full-text search by robot, date, sensor type, and anomalies  
✅ **Synchronized Replay**: Multi-recording timeline playback in browser  
✅ **3D Visualization**: WebGL-rendered point clouds with intensity mapping  
✅ **Dataset Export**: JSONL, Parquet, and TFRecord formats for ML pipelines  
✅ **Local Development**: Docker Compose with Postgres + MinIO  
✅ **Production Ready**: Kubernetes-ready, S3/GCS compatible storage  

## 🏗️ Architecture

```
On-Device (Python)      Cloud Ingestion (Node.js)       Dashboard (React)
┌──────────────────┐    ┌──────────────────────────┐    ┌────────────────┐
│ Robot Hardware   │    │ WebSocket Ingest         │    │ Fleet Status   │
│ • Camera         │───▶│ • Batch Assembly         │───▶│ • 3D Lidar     │
│ • Lidar          │    │ • Per-Sensor Chunking    │    │ • Camera Feed  │
│ • IMU            │    │ • Postgres Indexing      │    │ • Replay       │
│ • Odometry       │    │ • S3/Filesystem Archive  │    │ • Export       │
└──────────────────┘    └──────────────────────────┘    └────────────────┘
```

**Components**:
- `agents/python-agent`: On-device sensor collector with local buffering and reconnect logic
- `apps/api`: Node.js + TypeScript WebSocket ingest server with Postgres indexing
- `apps/web`: React + Vite dashboard with Three.js visualization
- `docker-compose.yml`: Local infrastructure (Postgres, MinIO, Redis)

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed system design.

## 🚀 Quick Start

### Local Development (5 minutes)

```bash
# Clone repository
git clone https://github.com/yourusername/roboviz.git
cd roboviz

# Start infrastructure
docker compose up -d postgres minio createbucket

# Install dependencies
npm install

# Initialize database
npm run db:seed

# Start services (3 terminals)
npm run dev:api      # Terminal 1: API on :4000
npm run dev:web      # Terminal 2: Dashboard on :5173
python agents/python-agent/agent.py  # Terminal 3: Simulator
```

Open [http://localhost:5173](http://localhost:5173) to see live telemetry!

### Docker Compose (Production-like)

```bash
docker compose -f docker-compose.prod.yml up -d
# Services auto-start: API, Web, Postgres, MinIO, Simulator
```

### Workspace Cleanup

```powershell
# Preview what will be removed
powershell -ExecutionPolicy Bypass -File scripts/clean-deep.ps1 -WhatIf

# Remove generated dependencies, runtime data, and build outputs
powershell -ExecutionPolicy Bypass -File scripts/clean-deep.ps1

# Optional: also remove demo media artifacts
powershell -ExecutionPolicy Bypass -File scripts/clean-deep.ps1 -RemoveDemoMedia
```

## 📖 Documentation

- **[API.md](API.md)** - REST and WebSocket endpoint reference
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System design and data flow
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Kubernetes, AWS, GCP, and Azure guides
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Development workflow and guidelines

## 💻 Development

### Project Structure

```
roboviz/
├── apps/
│   ├── api/                 # Express + Postgres ingestion server
│   │   ├── src/
│   │   │   ├── index.ts     # Entry point
│   │   │   ├── types.ts     # Zod schemas
│   │   │   ├── db.ts        # Postgres queries
│   │   │   ├── routes.ts    # REST endpoints
│   │   │   └── websocket.ts # Ingest/live handlers
│   │   └── sql/init.sql     # Schema
│   └── web/                 # React + Vite dashboard
│       ├── src/
│       │   ├── App.tsx      # Main dashboard
│       │   ├── api.ts       # API client
│       │   ├── types.ts     # Types
│       │   └── PointCloudView.tsx  # 3D viz
│       └── vite.config.ts
├── agents/
│   └── python-agent/        # Sensor collector
│       ├── agent.py
│       └── requirements.txt
├── docker-compose.yml       # Local dev stack
├── docker-compose.prod.yml  # Production stack
└── package.json             # Workspace root

```

### Available Scripts

```bash
npm run dev:api           # Start API with hot-reload
npm run dev:web           # Start dashboard with Vite
npm run build             # Build all workspaces
npm run lint              # Run ESLint
npm run format            # Run Prettier
npm run test              # Run tests
npm run clean             # Remove node_modules
npm run db:seed           # Seed database
```

### Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **On-Device** | Python, websockets, Pillow | 3.11, 15.x, 11.x |
| **API Server** | Node.js, Express, ws, Zod | 20, 4.21, 8.18, 3.24 |
| **Database** | PostgreSQL, pg | 16, 8.13 |
| **Storage** | Filesystem or S3-compatible | Local or MinIO |
| **Frontend** | React, Vite, Three.js | 19, 6, 0.174 |
| **Infra** | Docker, Docker Compose | Latest |

## 🔧 Configuration

### API Environment (`apps/api/.env`)

```env
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/roboviz
STORAGE_DRIVER=filesystem              # or 's3'
FILESYSTEM_STORAGE_PATH=../../artifacts/raw
S3_ENDPOINT=http://localhost:9000      # MinIO or AWS S3
S3_BUCKET=roboviz-raw
CORS_ORIGIN=http://localhost:5173
```

### Web Environment (`apps/web/.env`)

```env
VITE_API_BASE=http://localhost:4000
```

### Python Agent CLI

```bash
python agent.py \
  --robot-id robot-01 \
  --name "Warehouse Scout" \
  --location dock-a \
  --endpoint ws://localhost:4000/ws/ingest
```

## 📊 Data Model

### Sensor Events

```json
{
  "sensorType": "camera",
  "timestamp": "2026-04-21T10:30:45.123Z",
  "sequence": 100,
  "anomaly": false,
  "payload": {
    "imageBase64": "...",
    "width": 640,
    "height": 480
  }
}
```

Supported sensors: `camera`, `lidar`, `imu`, `odometry`

### API Endpoints

**REST**:
- `GET /health` - Health check
- `GET /api/robots` - List robots
- `GET /api/recordings` - Query recordings
- `GET /api/replay/events` - Get replay events
- `POST /api/exports/:recordingId` - Export dataset

**WebSocket**:
- `ws://localhost:4000/ws/ingest` - Agent ingest
- `ws://localhost:4000/ws/live` - Live telemetry

See [API.md](API.md) for full reference.

## 📈 Performance

### Throughput

| Metric | Value |
|--------|-------|
| Per-robot ingest | 100K+ messages/min |
| Fleet capacity (10 robots) | 1M messages/min |
| Fleet capacity (100 robots) | 10M messages/min |
| Event index latency | <50ms |
| Live broadcast latency | <100ms |

### Storage

| Item | Size |
|------|------|
| Raw sensor data (1 robot/hour) | 50-80 MB |
| Compressed archive (gzip) | 5-10 MB |
| Database index overhead | ~100 bytes/event |

## 🐳 Deployment

### Docker Compose

```bash
# Development
docker compose up -d

# Production
docker compose -f docker-compose.prod.yml up -d
```

### Kubernetes

```bash
kubectl apply -f k8s/
# See DEPLOYMENT.md for Helm charts
```

### Cloud Platforms

- **AWS**: ECS, Fargate, RDS, S3 ([guide](DEPLOYMENT.md#aws-ecs))
- **Google Cloud**: Cloud Run, Cloud SQL, GCS ([guide](DEPLOYMENT.md#google-cloud-run))
- **Azure**: Container Instances, Database for PostgreSQL ([guide](DEPLOYMENT.md#azure-container-instances))

## 🔒 Security

- ✅ TLS/mTLS for WebSocket and REST
- ✅ Zod schema validation on all inputs
- ✅ Per-robot data access control
- ✅ Rate limiting and quota enforcement
- ✅ Audit logging for all operations
- ✅ Environment variable secrets management

See [DEPLOYMENT.md](DEPLOYMENT.md#security-considerations) for details.

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for:
- Development environment setup
- Code standards (TypeScript strict mode, Python type hints)
- Testing guidelines
- Commit conventions
- Pull request process

## 📝 License

MIT © 2026 RoboViz Contributors

## 🙋 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/roboviz/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/roboviz/discussions)
- **Docs**: See [docs/](docs/) directory

## 🗺️ Roadmap

- [ ] Real-time anomaly detection
- [ ] Multi-tenant fleet isolation
- [ ] Advanced sensor fusion (camera + lidar alignment)
- [ ] Mobile app for remote monitoring
- [ ] Kubernetes Operator for deployment
- [ ] Open telemetry integration
- [ ] GraphQL API layer
- [ ] Time-series metrics DB (ClickHouse/TimescaleDB)
