import { Router } from 'express';
import { AiController } from './ai.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const aiRouter = Router();

aiRouter.use(requireAuth);

aiRouter.get('/config', AiController.getConfig);
aiRouter.post('/command', asyncHandler(AiController.processCommand));
