import { Router } from 'express';
import multer from 'multer';
import { UploadController } from './upload.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

export const uploadRouter = Router();

uploadRouter.use(requireAuth);

uploadRouter.post('/manual', asyncHandler(UploadController.manualUpload));
uploadRouter.post(
  '/csv',
  upload.fields([{ name: 'file', maxCount: 1 }, { name: 'csv_file', maxCount: 1 }]),
  asyncHandler(UploadController.csvUpload)
);
