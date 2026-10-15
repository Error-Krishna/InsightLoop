import type { Request, Response } from 'express';
import { ContactService, type ContactInput } from './contact.service.js';

export class ContactController {
  static async submit(req: Request, res: Response): Promise<void> {
    const result = await ContactService.submitMessage(req.body as ContactInput);
    res.status(200).json(result);
  }

  static methodNotAllowed(_req: Request, res: Response): void {
    res.status(405).json({ detail: 'Use POST to submit the contact form.' });
  }
}
