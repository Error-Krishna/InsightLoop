import { HealthRepository } from './health.repository.js';

export class HealthService {
  static getLiveness() {
    return { status: 'ok', service: 'InsightLoop Node API' };
  }

  static async getReadiness() {
    const mongo = await HealthRepository.checkMongo();
    const ready = mongo.status === 'up';

    return {
      status: ready ? 'ready' : 'unhealthy',
      ready,
      checks: {
        mongodb: mongo.status,
      },
    };
  }

  static async getDetailedHealth() {
    const startLag = performance.now();
    await new Promise((resolve) => setImmediate(resolve));
    const event_loop_lag_ms = Number((performance.now() - startLag).toFixed(3));

    const [mongo, redis] = await Promise.all([
      HealthRepository.checkMongo(),
      HealthRepository.checkRedis(),
    ]);

    const mem = process.memoryUsage();
    const isHealthy = mongo.status === 'up' && redis.status !== 'down';

    return {
      status: isHealthy ? 'healthy' : 'degraded',
      ready: mongo.status === 'up',
      uptime_seconds: Number(process.uptime().toFixed(2)),
      timestamp: new Date().toISOString(),
      event_loop_lag_ms,
      memory: {
        rss_bytes: mem.rss,
        heap_total_bytes: mem.heapTotal,
        heap_used_bytes: mem.heapUsed,
        external_bytes: mem.external,
      },
      checks: {
        mongodb: mongo,
        redis,
      },
    };
  }

  static async getPrometheusMetrics(): Promise<string> {
    const detailed = await this.getDetailedHealth();
    return [
      '# HELP process_uptime_seconds Process uptime in seconds',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${detailed.uptime_seconds}`,
      '# HELP nodejs_eventloop_lag_seconds Event loop lag in seconds',
      '# TYPE nodejs_eventloop_lag_seconds gauge',
      `nodejs_eventloop_lag_seconds ${(detailed.event_loop_lag_ms / 1000).toFixed(6)}`,
      '# HELP nodejs_memory_rss_bytes Resident Set Size memory',
      '# TYPE nodejs_memory_rss_bytes gauge',
      `nodejs_memory_rss_bytes ${detailed.memory.rss_bytes}`,
      '# HELP nodejs_memory_heap_used_bytes Heap used memory',
      '# TYPE nodejs_memory_heap_used_bytes gauge',
      `nodejs_memory_heap_used_bytes ${detailed.memory.heap_used_bytes}`,
      '# HELP mongodb_up MongoDB connection status (1 = up, 0 = down)',
      '# TYPE mongodb_up gauge',
      `mongodb_up ${detailed.checks.mongodb.status === 'up' ? 1 : 0}`,
      '# HELP mongodb_ping_latency_ms MongoDB ping latency in milliseconds',
      '# TYPE mongodb_ping_latency_ms gauge',
      `mongodb_ping_latency_ms ${Math.max(detailed.checks.mongodb.latency_ms, 0)}`,
      '# HELP redis_up Redis connection status (1 = up, 0 = down, -1 = disabled)',
      '# TYPE redis_up gauge',
      `redis_up ${detailed.checks.redis.status === 'up' ? 1 : detailed.checks.redis.status === 'down' ? 0 : -1}`,
      '',
    ].join('\n');
  }
}
