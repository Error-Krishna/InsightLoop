import http from 'node:http';
import { app } from './app.js';
import { env } from './config/env.js';
import { connectMongo, closeMongo } from './db/mongo.js';
import { setupWebSocketGateway, closeWebSockets } from './ws/gateway.js';
import { logger } from './utils/logger.js';

const server = http.createServer(app);

// Attach WebSocket gateway
setupWebSocketGateway(server);

let isShuttingDown = false;

export async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown initiated');

  const shutdownTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out (10s), forcing exit');
    process.exit(1);
  }, 10000);
  shutdownTimeout.unref();

  try {
    // 1. Close WebSockets with code 1001 (Going Away)
    closeWebSockets(1001, 'Going Away');

    // 2. Stop accepting new HTTP connections and drain in-flight requests
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    logger.info('HTTP server closed');

    // 3. Close MongoDB connection pool
    await closeMongo();
    logger.info('MongoDB connection closed');

    clearTimeout(shutdownTimeout);
    logger.info('Graceful shutdown completed successfully');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during graceful shutdown');
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT');
});

async function start() {
  await connectMongo();
  server.listen(env.PORT, env.HOST, () => {
    console.log(`InsightLoop Node API listening on http://${env.HOST}:${env.PORT}`);
  });
}

// Only start listening if not running inside vitest
if (!process.env.VITEST) {
  start().catch((err: unknown) => {
    console.error('Failed to start Node API server:', err);
    process.exit(1);
  });
}

export { server };
