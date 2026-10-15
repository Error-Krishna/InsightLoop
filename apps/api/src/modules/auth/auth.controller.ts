import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import type { GoogleLoginInput, LoginInput, RefreshTokenInput, SignupInput } from '@insightloop/shared';

export class AuthController {
  static async login(req: Request, res: Response): Promise<void> {
    const input = req.body as LoginInput;
    const result = await AuthService.login(input);
    res.status(200).json(result);
  }

  static async signup(req: Request, res: Response): Promise<void> {
    const input = req.body as SignupInput;
    const result = await AuthService.signup(input);
    res.status(201).json(result);
  }

  static async refresh(req: Request, res: Response): Promise<void> {
    const input = req.body as RefreshTokenInput;
    const result = await AuthService.refresh(input.refresh);
    res.status(200).json(result);
  }

  static async google(req: Request, res: Response): Promise<void> {
    const input = req.body as GoogleLoginInput;
    const result = await AuthService.googleLogin(input);
    res.status(200).json(result);
  }
}
