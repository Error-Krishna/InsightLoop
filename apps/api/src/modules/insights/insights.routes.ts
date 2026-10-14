import { Router, type Request, type Response } from 'express';
import { InsightsService } from './insights.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const insightsRouter = Router();

insightsRouter.use(requireAuth);

insightsRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const list = await InsightsService.listInsights(req.companyId!);
    res.status(200).json(list);
  })
);

insightsRouter.post(
  '/analyze',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await InsightsService.analyzeSalesData(req.companyId!);
    res.status(200).json(result);
  })
);

insightsRouter.get(
  '/:id/export',
  asyncHandler(async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const csvContent = await InsightsService.exportInsight(req.companyId!, id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="insight_${id}.csv"`);
    res.status(200).send(csvContent);
  })
);

insightsRouter.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await InsightsService.deleteInsight(req.companyId!, id);
    res.status(204).send();
  })
);
