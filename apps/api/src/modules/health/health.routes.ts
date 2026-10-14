import { Router, type Request, type Response } from 'express';
import { getDb } from '../../db/mongo.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const healthRouter = Router();

healthRouter.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'InsightLoop Node API' });
});

healthRouter.get(
  '/ready',
  asyncHandler(async (_req: Request, res: Response) => {
    let mongoStatus = 'down';
    try {
      const db = getDb();
      await db.command({ ping: 1 });
      mongoStatus = 'up';
    } catch {
      mongoStatus = 'down';
    }

    const ready = mongoStatus === 'up';
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'unhealthy',
      checks: {
        mongodb: mongoStatus,
      },
    });
  })
);
