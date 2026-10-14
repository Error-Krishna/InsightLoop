import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { UploadService } from './upload.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { BadRequestError } from '../../utils/errors.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

export const uploadRouter = Router();

uploadRouter.use(requireAuth);

uploadRouter.post(
  '/manual',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await UploadService.manualUpload(req.companyId!, req.body);
    res.status(201).json(result);
  })
);

uploadRouter.post(
  '/csv',
  upload.fields([{ name: 'file', maxCount: 1 }, { name: 'csv_file', maxCount: 1 }]),
  asyncHandler(async (req: Request, res: Response) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const file = files?.file?.[0] || files?.csv_file?.[0];

    if (!file) {
      throw new BadRequestError('CSV file is required.');
    }

    const result = await UploadService.csvUpload(req.companyId!, file.buffer, file.originalname);
    res.status(200).json(result);
  })
);
