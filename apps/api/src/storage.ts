import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from './config.js';

export type StoredObject = {
  objectKey: string;
  byteSize: number;
};

export interface ArchiveStorage {
  putObject(objectKey: string, body: Buffer, contentType: string): Promise<StoredObject>;
}

class FilesystemStorage implements ArchiveStorage {
  async putObject(objectKey: string, body: Buffer) {
    const destination = path.join(config.filesystemStoragePath, objectKey);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, body);
    return { objectKey, byteSize: body.byteLength };
  }
}

class S3ArchiveStorage implements ArchiveStorage {
  private client = new S3Client({
    endpoint: config.s3.endpoint,
    region: config.s3.region,
    credentials: config.s3.accessKeyId && config.s3.secretAccessKey ? {
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey
    } : undefined,
    forcePathStyle: true
  });

  async putObject(objectKey: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: objectKey,
      Body: body,
      ContentType: contentType,
      ContentEncoding: 'gzip'
    }));

    return { objectKey, byteSize: body.byteLength };
  }
}

export function createArchiveStorage(): ArchiveStorage {
  if (config.storageDriver === 's3') {
    return new S3ArchiveStorage();
  }

  return new FilesystemStorage();
}
