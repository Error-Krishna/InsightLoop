import type { Request, Response } from 'express';
import { DashboardService } from './dashboard.service.js';
import type { TenantScope } from '../../types/tenant.js';

export class DashboardController {
  static async getOverview(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const data = await DashboardService.getDashboardData(scope);
    res.status(200).json(data);
  }

  static async getSummary(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const summary = await DashboardService.getSummaryData(scope);
    res.status(200).json(summary);
  }

  static async getRevExp(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const months = req.query.months ? parseInt(req.query.months as string, 10) : 6;
    const data = await DashboardService.getRevExpData(scope, months);
    res.status(200).json(data);
  }

  static async getProfitTrends(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const months = req.query.months ? parseInt(req.query.months as string, 10) : 6;
    const interval = (req.query.interval as string) || 'monthly';
    const data = await DashboardService.getProfitTrends(scope, months, interval);
    res.status(200).json(data);
  }

  static async getWorkers(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const workers = await DashboardService.getWorkerPayments(scope);
    res.status(200).json({ workers });
  }

  static async getTopWorkers(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const workers = await DashboardService.getTopWorkers(scope);
    res.status(200).json({ workers });
  }

  static async exportReport(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const type = String(req.params.type ?? '');
    const fileUrl = await DashboardService.generateExportFile(scope, type);
    res.status(200).json({ file_url: fileUrl });
  }
}
