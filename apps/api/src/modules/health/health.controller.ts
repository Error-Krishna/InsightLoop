import type { Request, Response } from 'express';
import { HealthService } from './health.service.js';

export class HealthController {
  static getLive(_req: Request, res: Response): void {
    const status = HealthService.getLiveness();
    res.status(200).json(status);
  }

  static async getReady(_req: Request, res: Response): Promise<void> {
    const result = await HealthService.getReadiness();
    res.status(result.ready ? 200 : 503).json({
      status: result.status,
      checks: result.checks,
    });
  }

  static async getDetailed(_req: Request, res: Response): Promise<void> {
    const result = await HealthService.getDetailedHealth();
    res.status(result.ready ? 200 : 503).json(result);
  }

  static async getMetrics(_req: Request, res: Response): Promise<void> {
    const metrics = await HealthService.getPrometheusMetrics();
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.status(200).send(metrics);
  }
}
