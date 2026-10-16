import { Router } from 'express';
import multer from 'multer';
import { ProfileController } from './profile.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const upload = multer();
export const profileRouter = Router();

profileRouter.use(requireAuth);

profileRouter.get('/', asyncHandler(ProfileController.getProfile));
profileRouter.put(
  '/',
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'stamp', maxCount: 1 },
    { name: 'signature', maxCount: 1 },
  ]),
  asyncHandler(ProfileController.updateProfile)
);
profileRouter.get('/settings', asyncHandler(ProfileController.getSettings));
profileRouter.put('/settings', asyncHandler(ProfileController.updateSettings));
