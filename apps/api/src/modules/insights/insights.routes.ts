import { Router } from 'express';
import { InsightsController } from './insights.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const insightsRouter = Router();

insightsRouter.use(requireAuth);

insightsRouter.get('/', asyncHandler(InsightsController.listInsights));
insightsRouter.post('/analyze', asyncHandler(InsightsController.analyze));
insightsRouter.get('/:id/export', asyncHandler(InsightsController.exportInsight));
insightsRouter.delete('/:id', asyncHandler(InsightsController.deleteInsight));
