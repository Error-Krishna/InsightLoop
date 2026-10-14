import cors from 'cors';
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';

export const app: express.Express = express();

app.use(helmet());
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

// Standard DRF-compatible error handling envelope
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const detail = err.detail || err.message || 'Internal Server Error';
  res.status(status).json({ detail });
});
