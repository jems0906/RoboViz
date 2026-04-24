import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();

const defaultStoragePath = path.resolve(process.cwd(), '../../artifacts/raw');
const defaultExportPath = path.resolve(process.cwd(), '../../artifacts/exports');

export const config = {
  port: Number.parseInt(process.env.PORT ?? '4000', 10),
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/roboviz',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  storageDriver: process.env.STORAGE_DRIVER ?? 'filesystem',
  filesystemStoragePath: path.resolve(process.cwd(), process.env.FILESYSTEM_STORAGE_PATH ?? defaultStoragePath),
  exportPath: path.resolve(process.cwd(), process.env.EXPORT_PATH ?? defaultExportPath),
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    bucket: process.env.S3_BUCKET ?? 'roboviz-raw',
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY
  }
};
