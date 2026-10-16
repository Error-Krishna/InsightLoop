import { Router } from 'express';
import { DashboardController } from './dashboard.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get('/overview', asyncHandler(DashboardController.getOverview));
dashboardRouter.get('/summary', asyncHandler(DashboardController.getSummary));
dashboardRouter.get('/rev-exp', asyncHandler(DashboardController.getRevExp));
dashboardRouter.get('/profit-trends', asyncHandler(DashboardController.getProfitTrends));
dashboardRouter.get('/workers', asyncHandler(DashboardController.getWorkers));
dashboardRouter.get('/top-workers', asyncHandler(DashboardController.getTopWorkers));
dashboardRouter.get('/export/:type', asyncHandler(DashboardController.exportReport));
