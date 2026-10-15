import { HealthRepository } from './health.repository.js';

export class HealthService {
  static getLiveness() {
    return { status: 'ok', service: 'InsightLoop Node API' };
  }

  static async getReadiness() {
    const isMongoUp = await HealthRepository.pingMongo();
    const ready = isMongoUp;

    return {
      status: ready ? 'ready' : 'unhealthy',
      ready,
      checks: {
        mongodb: isMongoUp ? 'up' : 'down',
      },
    };
  }
}
