# RoboViz Deployment Guide

## Prerequisites

- Docker & Docker Compose
- Node.js 20+
- Python 3.11+
- ~10GB storage for test data

## Local Development Deployment

### Quick Start

```bash
cd roboviz

# 1. Start infrastructure
docker compose up -d postgres minio createbucket

# 2. Install dependencies
npm install

# 3. Initialize database
npx tsx apps/api/scripts/seed.js

# 4. Start services in separate terminals
npm run dev:api      # Terminal 1
npm run dev:web      # Terminal 2
python agents/python-agent/agent.py  # Terminal 3
```

Access the dashboard at `http://localhost:5173`

### Environment Configuration

#### API Server (`apps/api/.env`)
```env
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/roboviz
STORAGE_DRIVER=filesystem
FILESYSTEM_STORAGE_PATH=../../artifacts/raw
CORS_ORIGIN=http://localhost:5173
```

#### Web App (`apps/web/.env`)
```env
VITE_API_BASE=http://localhost:4000
```

## Docker Compose Deployment

### Development Stack

```bash
docker compose up -d
```

Services:
- PostgreSQL: `localhost:5432`
- MinIO: `localhost:9000` (API), `localhost:9001` (UI)
- API: `localhost:4000`
- Web: `localhost:80`
- Agent Simulator: Connects automatically

### Production Stack

```bash
docker compose -f docker-compose.prod.yml up -d
```

Builds and runs optimized images:
- Multi-stage builds for frontend
- Alpine base images for reduced size
- No development dependencies

## Kubernetes Deployment

### Prerequisites

```bash
# Install Helm
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Create namespace
kubectl create namespace roboviz
```

### Deploy with Helm

```bash
# Add RoboViz Helm repository
helm repo add roboviz https://charts.roboviz.dev
helm repo update

# Install
helm install roboviz roboviz/roboviz \
  --namespace roboviz \
  --values values-production.yaml
```

### Helm Values Example (`values-production.yaml`)

```yaml
replicaCount: 3

image:
  registry: ghcr.io/yourorg
  tag: latest

postgresql:
  enabled: true
  auth:
    username: postgres
    password: secure-password
    database: roboviz
  primary:
    persistence:
      size: 100Gi

s3:
  enabled: true
  endpoint: s3.amazonaws.com
  region: us-east-1
  bucket: roboviz-recordings
  accessKey: ${AWS_ACCESS_KEY_ID}
  secretKey: ${AWS_SECRET_ACCESS_KEY}

ingress:
  enabled: true
  hosts:
    - roboviz.example.com
  tls:
    - secretName: roboviz-tls
      hosts:
        - roboviz.example.com
```

### Deploy Individual Services

```bash
# API Deployment
kubectl apply -f k8s/api-deployment.yaml
kubectl apply -f k8s/api-service.yaml

# Web Deployment
kubectl apply -f k8s/web-deployment.yaml
kubectl apply -f k8s/web-ingress.yaml

# PostgreSQL StatefulSet
kubectl apply -f k8s/postgres-statefulset.yaml
kubectl apply -f k8s/postgres-service.yaml
```

## Cloud Platform Deployments

### AWS ECS

```bash
# Build and push images
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com

docker build -t roboviz-api -f Dockerfile.api .
docker tag roboviz-api:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/roboviz-api:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/roboviz-api:latest

# Create ECS cluster and task definitions
aws ecs create-cluster --cluster-name roboviz

# Register task definitions
aws ecs register-task-definition --cli-input-json file://ecs-task-definition.json

# Create service
aws ecs create-service --cluster roboviz --service-name roboviz-api \
  --task-definition roboviz-api:1 --desired-count 3
```

### Google Cloud Run

```bash
# Build with Cloud Build
gcloud builds submit --tag gcr.io/PROJECT_ID/roboviz-api

# Deploy to Cloud Run
gcloud run deploy roboviz-api \
  --image gcr.io/PROJECT_ID/roboviz-api \
  --platform managed \
  --region us-central1 \
  --set-env-vars DATABASE_URL=cloudsql:project:region:instance \
  --memory 2Gi \
  --cpu 2
```

### Azure Container Instances

```bash
# Build image
az acr build --registry roboviz --image roboviz-api:latest --file Dockerfile.api .

# Deploy
az container create \
  --resource-group roboviz \
  --name roboviz-api \
  --image roboviz.azurecr.io/roboviz-api:latest \
  --ports 4000 \
  --environment-variables \
    DATABASE_URL="postgresql://..." \
    STORAGE_DRIVER="s3"
```

## Database Migration & Backup

### Initialize Schema

```bash
# Using psql
psql -U postgres -d roboviz -h localhost -f apps/api/sql/init.sql

# Using Node.js
npm --workspace @roboviz/api run db:init
```

### Backup

```bash
# PostgreSQL backup
docker exec roboviz-postgres pg_dump -U postgres roboviz > backup-$(date +%Y%m%d).sql

# Archive storage backup (S3)
aws s3 sync s3://roboviz-raw ./backups/
```

### Restore

```bash
# PostgreSQL restore
psql -U postgres roboviz < backup-20260421.sql

# From S3 backup
aws s3 sync ./backups/ s3://roboviz-raw
```

## Monitoring & Observability

### Prometheus Metrics

Add to `docker-compose.yml`:

```yaml
prometheus:
  image: prom/prometheus
  volumes:
    - ./prometheus.yml:/etc/prometheus/prometheus.yml
  ports:
    - "9090:9090"
```

### Grafana Dashboards

```bash
docker run -d --name grafana -p 3000:3000 grafana/grafana
```

Import dashboards for:
- API request rates and latencies
- Database connection pool
- Storage I/O throughput
- WebSocket connection count
- Robot fleet status

### Structured Logging

```bash
# Enable JSON logging
export LOG_FORMAT=json

# Stream logs to ELK
docker-compose up -d elasticsearch logstash kibana
```

### Health Checks

```bash
# API health
curl http://localhost:4000/health

# Database health
psql -U postgres -d roboviz -c "SELECT 1"

# Storage health
curl -u minioadmin:minioadmin http://localhost:9000/minio/health/live
```

## Scaling Configuration

### Horizontal Scaling

```yaml
# kubernetes deployment
kind: Deployment
metadata:
  name: roboviz-api
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  
  template:
    spec:
      containers:
      - name: api
        image: roboviz-api:latest
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 2000m
            memory: 2Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 4000
          initialDelaySeconds: 10
          periodSeconds: 10
```

### Vertical Scaling

```bash
# PostgreSQL pool size
DATABASE_POOL_SIZE=20

# WebSocket buffer size
WS_MAX_PAYLOAD=10485760  # 10MB

# Archive batch size
BATCH_SIZE=500
```

## Disaster Recovery

### RTO: Recovery Time Objective

| Component | RTO |
|-----------|-----|
| API Server | 2-5 minutes (auto-restart) |
| Database | 5-15 minutes (restore from backup) |
| Storage | 15-30 minutes (S3 restore) |

### RPO: Recovery Point Objective

| Data | RPO |
|------|-----|
| Event Index | 1 minute (continuous replication) |
| Raw Archives | Configurable (default 1 hour) |
| Configuration | On-demand (version controlled) |

### Failover Procedures

```bash
# Switch to replica database
kubectl scale deployment roboviz-api-replica --replicas=1

# Promote read replica to primary
aws rds promote-read-replica --db-instance-identifier roboviz-replica

# Re-route traffic
kubectl patch service roboviz-api -p '{"spec":{"selector":{"tier":"primary"}}}'
```

## Performance Tuning

### PostgreSQL Configuration

```sql
-- Connection pooling
max_connections = 200
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 64MB

-- Query optimization
random_page_cost = 1.1
effective_io_concurrency = 200

-- Indexes
CREATE INDEX CONCURRENTLY idx_sensor_events_ts_partial 
  ON sensor_events(ts) 
  WHERE ts > NOW() - INTERVAL '30 days';
```

### API Tuning

```env
# Connection pool
DB_POOL_MIN=5
DB_POOL_MAX=20

# WebSocket
WS_BATCH_FLUSH_INTERVAL=0.2
WS_MAX_QUEUE_SIZE=5000

# Archive
ARCHIVE_COMPRESSION_LEVEL=6
CHUNK_SIZE_MB=100
```

## Troubleshooting

### API Not Starting

```bash
# Check logs
docker logs roboviz-api

# Verify database connection
npx tsx -e "
  import pg from 'pg';
  const pool = new pg.Pool({connectionString: process.env.DATABASE_URL});
  pool.query('SELECT NOW()')
    .then(() => console.log('✓ Connected'))
    .catch(e => console.error('✗', e.message));
"
```

### High Database Load

```sql
-- Check slow queries
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY mean_time DESC LIMIT 10;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan 
FROM pg_stat_user_indexes 
ORDER BY idx_scan ASC;
```

### WebSocket Connection Issues

```bash
# Test WebSocket endpoint
npm install -g wscat
wscat -c ws://localhost:4000/ws/ingest
```

### Storage Full

```bash
# Check disk usage
df -h

# Archive older recordings
DELETE FROM recordings WHERE ended_at < NOW() - INTERVAL '90 days';

# Vacuum database
VACUUM ANALYZE;
```
