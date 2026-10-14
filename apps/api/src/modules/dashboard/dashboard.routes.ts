import { Router, type Request, type Response } from 'express';
import { DashboardService } from './dashboard.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get(
  '/overview',
  asyncHandler(async (req: Request, res: Response) => {
    const data = await DashboardService.getDashboardData(req.companyId!);
    res.status(200).json(data);
  })
);

dashboardRouter.get(
  '/summary',
  asyncHandler(async (req: Request, res: Response) => {
    const summary = await DashboardService.getSummaryData(req.companyId!);
    res.status(200).json(summary);
  })
);

dashboardRouter.get(
  '/rev-exp',
  asyncHandler(async (req: Request, res: Response) => {
    const months = req.query.months ? parseInt(req.query.months as string, 10) : 6;
    const data = await DashboardService.getRevExpData(req.companyId!, months);
    res.status(200).json(data);
  })
);

dashboardRouter.get(
  '/profit-trends',
  asyncHandler(async (req: Request, res: Response) => {
    const months = req.query.months ? parseInt(req.query.months as string, 10) : 6;
    const interval = (req.query.interval as string) || 'monthly';
    const data = await DashboardService.getProfitTrends(req.companyId!, months, interval);
    res.status(200).json(data);
  })
);

dashboardRouter.get(
  '/workers',
  asyncHandler(async (req: Request, res: Response) => {
    const workers = await DashboardService.getWorkerPayments(req.companyId!);
    res.status(200).json({ workers });
  })
);

dashboardRouter.get(
  '/top-workers',
  asyncHandler(async (req: Request, res: Response) => {
    const workers = await DashboardService.getTopWorkers(req.companyId!);
    res.status(200).json({ workers });
  })
);
