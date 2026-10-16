import type { Request, Response } from 'express';
import { UploadService, type ManualUploadInput } from './upload.service.js';
import { BadRequestError } from '../../utils/errors.js';
import type { TenantScope } from '../../types/tenant.js';
import { wsEvents } from '../../ws/gateway.js';

export class UploadController {
  static async manualUpload(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const result = await UploadService.manualUpload(scope, req.body as ManualUploadInput);
    wsEvents.emit('dashboard.update', { companyId: scope.companyId });
    res.status(201).json(result);
  }

  static async csvUpload(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const file = files?.file?.[0] ?? files?.csv_file?.[0];

    if (!file) {
      throw new BadRequestError('CSV file is required.');
    }

    const result = await UploadService.csvUpload(scope, file.buffer, file.originalname);
    wsEvents.emit('dashboard.update', { companyId: scope.companyId });
    res.status(200).json(result);
  }
}

