import { Router, type Request, type Response } from 'express';
import { logger } from '../../utils/logger.js';

export const legacyRouter = Router();

const legacyPaths = [
  '/login',
  '/dashboard',
  '/dashboard/api/*',
  '/insights',
  '/insights/*',
  '/upload',
  '/upload/*',
  '/distribution/*',
  '/user/*',
  '/aiexport',
  '/aiexport/*',
  '/auth/google/callback',
];

function handleLegacyRoute(req: Request, res: Response): void {
  logger.warn(
    {
      hit: 'legacy-shadow-route',
      path: req.originalUrl || req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    },
    'Hit on deprecated legacy server-rendered route (NEEDS-TRAFFIC-EVIDENCE)'
  );

  res.setHeader('X-InsightLoop-Shadow-Route', 'legacy-django-view');
  res.status(404).json({
    status: 404,
    error: 'Legacy server-rendered Django endpoint is deprecated. Use the InsightLoop React SPA.',
    classification: 'NEEDS-TRAFFIC-EVIDENCE',
    path: req.originalUrl || req.path,
  });
}

for (const p of legacyPaths) {
  legacyRouter.all(p, handleLegacyRoute);
}
