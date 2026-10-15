import type { Request, Response } from 'express';
import { ProfileService, type UpdateProfileInput, type UpdateSettingsInput } from './profile.service.js';
import type { TenantScope } from '../../types/tenant.js';

export class ProfileController {
  static async getProfile(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const result = await ProfileService.getProfile(req.user!.user_id, scope);
    res.status(200).json(result);
  }

  static async updateProfile(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const input = req.body as UpdateProfileInput;
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
