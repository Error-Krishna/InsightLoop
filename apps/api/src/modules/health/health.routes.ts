import { Router } from 'express';
import { HealthController } from './health.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const healthRouter = Router();

healthRouter.get('/live', HealthController.getLive);
healthRouter.get('/ready', asyncHandler(HealthController.getReady));
healthRouter.get('/detailed', asyncHandler(HealthController.getDetailed));
healthRouter.get('/metrics', asyncHandler(HealthController.getMetrics));
