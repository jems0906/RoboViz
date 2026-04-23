import { z } from 'zod';

export const robotRegistrationSchema = z.object({
  robotId: z.string().min(1),
  name: z.string().min(1),
  location: z.string().min(1),
  status: z.enum(['online', 'offline', 'degraded']).default('online'),
  metadata: z.record(z.any()).optional()
});

export const sensorEventSchema = z.object({
  sensorType: z.enum(['camera', 'lidar', 'imu', 'odometry']),
  timestamp: z.string().datetime(),
  sequence: z.number().int().nonnegative(),
  anomaly: z.boolean().optional().default(false),
  payload: z.record(z.any())
});

export const ingestBatchSchema = z.object({
  type: z.literal('ingest.batch'),
  robot: robotRegistrationSchema,
  recordingId: z.string().optional(),
  events: z.array(sensorEventSchema).min(1)
});

export const registerMessageSchema = z.object({
  type: z.literal('register'),
  robot: robotRegistrationSchema
});

export const replayQuerySchema = z.object({
  recordingIds: z.array(z.string()).min(1),
  sensorTypes: z.array(z.string()).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional()
});

export type RobotRegistration = z.infer<typeof robotRegistrationSchema>;
export type SensorEventInput = z.infer<typeof sensorEventSchema>;
export type IngestBatchMessage = z.infer<typeof ingestBatchSchema>;
export type RegisterMessage = z.infer<typeof registerMessageSchema>;
export type ReplayQuery = z.infer<typeof replayQuerySchema>;

export type LiveTelemetryEvent = {
  robotId: string;
  recordingId: string;
  sensorType: SensorEventInput['sensorType'];
  timestamp: string;
  sequence: number;
  anomaly: boolean;
  payload: Record<string, unknown>;
};
