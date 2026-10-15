import type { Request, Response } from 'express';
import { InsightsService } from './insights.service.js';
import type { TenantScope } from '../../types/tenant.js';

export class InsightsController {
  static async listInsights(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const list = await InsightsService.listInsights(scope);
    res.status(200).json(list);
  }

  static async analyze(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const result = await InsightsService.analyzeSalesData(scope);
    res.status(200).json(result);
  }

  static async exportInsight(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const csvContent = await InsightsService.exportInsight(scope, id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="insight_${id}.csv"`);
    res.status(200).send(csvContent);
  }

  static async deleteInsight(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await InsightsService.deleteInsight(scope, id);
    res.status(204).send();
  }
}
