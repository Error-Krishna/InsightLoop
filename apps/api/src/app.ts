import cors from 'cors';
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';

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

app.use(helmet({
  crossOriginResourcePolicy: false,
}));

app.use(
  cors({
    origin: env.CORS_ORIGIN.split(',').map(s => s.trim()),
    credentials: true,
  })
);

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
app.use('/contact', contactRouter);

// Standard DRF-compatible error handling envelope
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const detail = err.detail || err.message || 'Internal Server Error';
  const body: Record<string, any> = { detail };
  if (err.code) {
    body.code = err.code;
  }
  if (err.missing) {
    body.missing = err.missing;
  }
  if (err.errors) {
    body.errors = err.errors;
  }
  res.status(status).json(body);
});
