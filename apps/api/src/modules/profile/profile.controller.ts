import path from 'node:path';
import type { Request, Response } from 'express';
import { ProfileService, type UpdateProfileInput, type UpdateSettingsInput } from './profile.service.js';
import { StorageService } from '../upload/storage.service.js';
import type { TenantScope } from '../../types/tenant.js';

export class ProfileController {
  static async getProfile(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const result = await ProfileService.getProfile(req.user!.user_id, scope);
    res.status(200).json(result);
  }

  static async updateProfile(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const input = { ...req.body } as UpdateProfileInput;
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;

    if (files) {
      if (files.logo?.[0]) {
        const file = files.logo[0];
        const filename = `${Date.now()}_${path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        input.logo_url = await StorageService.save(`profile/${scope.companyId}/logo_${filename}`, file.buffer, file.mimetype);
      }
      if (files.stamp?.[0]) {
        const file = files.stamp[0];
        const filename = `${Date.now()}_${path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        input.stamp_url = await StorageService.save(`profile/${scope.companyId}/stamp_${filename}`, file.buffer, file.mimetype);
      }
      if (files.signature?.[0]) {
        const file = files.signature[0];
        const filename = `${Date.now()}_${path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        input.signature_url = await StorageService.save(`profile/${scope.companyId}/signature_${filename}`, file.buffer, file.mimetype);
      }
    }

    const result = await ProfileService.updateProfile(req.user!.user_id, scope, input);
    res.status(200).json(result);
  }

  static async getSettings(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const result = await ProfileService.getSettings(req.user!.user_id, scope);
    res.status(200).json(result);
  }

  static async updateSettings(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const input = req.body as UpdateSettingsInput;
    const result = await ProfileService.updateSettings(req.user!.user_id, scope, input);
    res.status(200).json(result);
  }
}
