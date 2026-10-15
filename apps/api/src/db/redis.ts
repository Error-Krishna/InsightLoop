import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (!env.REDIS_URL) {
    return null;
  }
  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    redisClient.on('error', (err: unknown) => {
      logger.error({ err }, 'Redis connection error');
    });
  }
  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('Redis connection closed cleanly');
    } catch (err: unknown) {
      logger.warn({ err }, 'Error closing Redis connection; forcing disconnect');
      redisClient.disconnect();
    } finally {
      redisClient = null;
    }
  }
}
