import { Router } from 'express';
import { HealthController } from './health.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireMetricsAuth } from '../../middleware/metricsAuth.js';

export const healthRouter = Router();

// Public liveness & readiness checks (lightweight, zero internal diagnostics)
healthRouter.get('/live', HealthController.getLive);
healthRouter.get('/ready', asyncHandler(HealthController.getReady));

// Protected diagnostic & metrics endpoints (requires METRICS_TOKEN)
healthRouter.get('/detailed', requireMetricsAuth, asyncHandler(HealthController.getDetailed));
healthRouter.get('/metrics', requireMetricsAuth, asyncHandler(HealthController.getMetrics));
