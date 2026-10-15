import cors from 'cors';
import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// Route modules
import { healthRouter } from './modules/health/health.routes.js';
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

export const app: express.Express = express();

app.set('trust proxy', Number(env.TRUST_PROXY) || 1);

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

const allowedOrigins = env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) { callback(null, true); return; }
      if (allowedOrigins.includes(origin)) {
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

// Root health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'InsightLoop Node API' });
});

// Mount module routers
app.use('/api/v1/health', healthRouter);
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

// 404 handler for undefined routes
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);
