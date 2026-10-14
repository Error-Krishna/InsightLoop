import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { ProfileService } from './profile.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const upload = multer();
export const profileRouter = Router();

profileRouter.use(requireAuth);

profileRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await ProfileService.getProfile(req.user!.user_id, req.companyId!);
    res.status(200).json(result);
  })
);

profileRouter.put(
  '/',
  upload.none(),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await ProfileService.updateProfile(
      req.user!.user_id,
      req.companyId!,
      req.body
    );
    res.status(200).json(result);
  })
);

profileRouter.get(
  '/settings',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await ProfileService.getSettings(req.user!.user_id, req.companyId!);
    res.status(200).json(result);
  })
);

profileRouter.put(
  '/settings',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await ProfileService.updateSettings(
      req.user!.user_id,
      req.companyId!,
      req.body
    );
    res.status(200).json(result);
  })
);
