import type { Request, Response } from 'express';
import { AiService } from './ai.service.js';
import type { TenantScope } from '../../types/tenant.js';

export class AiController {
  static getConfig(_req: Request, res: Response): void {
    const config = AiService.getConfig();
    res.status(200).json(config);
  }

  static async processCommand(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const command = (req.body as { command?: string }).command ?? '';
    const assistant = (req.body as { assistant?: string }).assistant ?? 'jarvis';
    const email = req.user?.email ?? '';
    const result = await AiService.processAiCommand(scope, email, command, assistant);
    res.status(200).json(result);
  }
}
