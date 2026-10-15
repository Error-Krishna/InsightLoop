import { Router } from 'express';
import multer from 'multer';
import { ProfileController } from './profile.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const upload = multer();
export const profileRouter = Router();

profileRouter.use(requireAuth);

profileRouter.get('/', asyncHandler(ProfileController.getProfile));
profileRouter.put('/', upload.none(), asyncHandler(ProfileController.updateProfile));
profileRouter.get('/settings', asyncHandler(ProfileController.getSettings));
profileRouter.put('/settings', asyncHandler(ProfileController.updateSettings));
