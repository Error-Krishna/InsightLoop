import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { asyncHandler } from './utils/asyncHandler.js';

// Route modules
import { healthRouter } from './modules/health/health.routes.js';
import { HealthController } from './modules/health/health.controller.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { profileRouter } from './modules/profile/profile.routes.js';
import { inventoryRouter } from './modules/inventory/inventory.routes.js';
import { workersRouter } from './modules/workers/workers.routes.js';
import { billsRouter } from './modules/bills/bills.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { insightsRouter } from './modules/insights/insights.routes.js';
import { uploadRouter } from './modules/upload/upload.routes.js';
import { aiRouter } from './modules/ai/ai.routes.js';
import { contactRouter } from './modules/contact/contact.routes.js';
import { legacyRouter } from './modules/legacy/legacy.routes.js';
import { StorageService, getMimeType } from './modules/upload/storage.service.js';

import { requireMetricsAuth } from './middleware/metricsAuth.js';

export const app: express.Express = express();

app.set('trust proxy', Number(env.TRUST_PROXY) || 1);

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) { callback(null, true); return; }
      const rawCors = process.env.CORS_ORIGIN || process.env.DJANGO_CORS_ALLOWED_ORIGINS || env.CORS_ORIGIN;
      const corsList = rawCors.split(',').map((s) => s.trim()).filter(Boolean);
      const frontendOrigin = process.env.FRONTEND_ORIGIN || env.FRONTEND_ORIGIN;
      if (frontendOrigin && typeof frontendOrigin === 'string' && frontendOrigin.trim()) {
        const trimmed = frontendOrigin.trim();
        if (!corsList.includes(trimmed)) {
          corsList.push(trimmed);
        }
      }
      if (corsList.includes(origin)) {
        callback(null, true); return;
      }
      callback(null, false);
    },
    credentials: true,
    exposedHeaders: [
      'Content-Disposition',
      'Retry-After',
      'X-Request-ID',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
    ],
  })
);

app.use(requestIdMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root endpoint: mirrors Django root_redirect (redirects to FRONTEND_ORIGIN, or returns JSON)
app.get('/', (_req: Request, res: Response) => {
  const origin = env.FRONTEND_ORIGIN || process.env.FRONTEND_ORIGIN;
  if (origin && typeof origin === 'string' && origin.trim()) {
    res.redirect(origin.trim());
    return;
  }
  res.status(200).json({ status: 'ok', service: 'InsightLoop API' });
});

// Root health check and observability endpoints
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'InsightLoop Node API' });
});
app.get('/health/detailed', requireMetricsAuth, asyncHandler(HealthController.getDetailed));
app.get('/metrics', requireMetricsAuth, asyncHandler(HealthController.getMetrics));

// Mount module routers
app.use('/api/v1/health', healthRouter);
app.use('/api/v1/metrics', requireMetricsAuth, asyncHandler(HealthController.getMetrics));
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/profile', profileRouter);
app.use('/api/v1/inventory', inventoryRouter);
app.use('/api/v1/workers', workersRouter);
app.use('/api/v1/bills', billsRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/insights', insightsRouter);
app.use('/api/v1/upload', uploadRouter);
app.use('/api/v1/ai', aiRouter);
app.use('/api/v1/contact', contactRouter);
app.use('/contact', contactRouter);
app.use(legacyRouter);

// Media serving endpoint (persisted via MongoDB GridFS / S3)
app.get(
  '/media/*',
  asyncHandler(async (req: Request, res: Response) => {
    const rawPath = req.params[0] ?? '';
    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(rawPath);
    } catch {
      res.status(400).json({ error: 'Invalid file path encoding.' });
      return;
    }

    if (
      !decodedPath ||
      decodedPath.includes('..') ||
      decodedPath.includes('\0') ||
      decodedPath.includes('\\')
    ) {
      res.status(400).json({ error: 'Invalid or insecure file path.' });
      return;
    }

    const fileBuffer = await StorageService.read(decodedPath);
    if (!fileBuffer) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }

    const mimeType = getMimeType(decodedPath);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).send(fileBuffer);
  })
);

// Static asset serving (optional single-container deployment)
const staticDir = path.resolve(process.cwd(), 'apps/web/dist');
// eslint-disable-next-line security/detect-non-literal-fs-filename -- reason: staticDir is resolved from process.cwd() repo root
if (process.env.SERVE_STATIC === 'true' && fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get('*', (req: Request, res: Response, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/ws') || req.path.startsWith('/health') || req.path.startsWith('/metrics')) {
      next();
      return;
    }
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

// 404 handler for undefined routes
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);
