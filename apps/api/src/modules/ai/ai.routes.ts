import { Router, type Request, type Response } from 'express';
import { AiService } from './ai.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const aiRouter = Router();

aiRouter.use(requireAuth);

aiRouter.get(
  '/config',
  asyncHandler(async (_req: Request, res: Response) => {
    const config = AiService.getConfig();
    res.status(200).json(config);
  })
);

aiRouter.post(
  '/command',
  asyncHandler(async (req: Request, res: Response) => {
    const command = req.body.command || '';
    const assistant = req.body.assistant || 'jarvis';
    const email = (req as any).user?.email || '';
    const result = await AiService.processAiCommand(req.companyId!, email, command, assistant);
    res.status(200).json(result);
  })
);
