import { getDb, getClient } from '../../db/mongo.js';
import { getRedisClient } from '../../db/redis.js';

export interface MongoHealthCheck {
  status: 'up' | 'down';
  latency_ms: number;
  pool: {
    maxPoolSize: number;
    minPoolSize: number;
  };
}

export interface RedisHealthCheck {
  configured: boolean;
  status: 'up' | 'down' | 'disabled';
  latency_ms?: number;
}

export class HealthRepository {
  static async checkMongo(): Promise<MongoHealthCheck> {
    const client = getClient();
    const maxPoolSize = client?.options?.maxPoolSize ?? 100;
    const minPoolSize = client?.options?.minPoolSize ?? 0;
    try {
      const db = getDb();
      const start = performance.now();
      await db.command({ ping: 1 });
      const latency_ms = Number((performance.now() - start).toFixed(2));
      return { status: 'up', latency_ms, pool: { maxPoolSize, minPoolSize } };
    } catch {
      // SILENT-FALLBACK-REASON: Health probe returns down status without throwing to allow readiness check evaluation
      return { status: 'down', latency_ms: -1, pool: { maxPoolSize, minPoolSize } };
    }
  }

  static async pingMongo(): Promise<boolean> {
    const check = await this.checkMongo();
    return check.status === 'up';
  }

  static async checkRedis(): Promise<RedisHealthCheck> {
    const client = getRedisClient();
    if (!client) {
      return { configured: false, status: 'disabled' };
    }
    try {
      const start = performance.now();
      await client.ping();
      const latency_ms = Number((performance.now() - start).toFixed(2));
      return { configured: true, status: 'up', latency_ms };
    } catch {
      // SILENT-FALLBACK-REASON: Redis probe returns down status without throwing to allow degraded operation
      return { configured: true, status: 'down', latency_ms: -1 };
    }
  }
}
