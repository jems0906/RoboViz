import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { LiveHub } from './liveHub.js';
import { createRoutes } from './routes.js';
import { createWebSocketLayer } from './websocket.js';

export function createServer() {
  const app = express();
  const liveHub = new LiveHub();

  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '10mb' }));
  app.use(createRoutes());
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    response.status(500).json({ error: message });
  });

  const server = http.createServer(app);
  createWebSocketLayer(server, liveHub);

  return { app, server };
}
