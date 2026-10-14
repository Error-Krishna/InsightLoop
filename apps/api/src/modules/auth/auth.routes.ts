import { Router, type Request, type Response } from 'express';
import { GoogleLoginSchema, LoginSchema, RefreshTokenSchema, SignupSchema } from '@insightloop/shared';
import { AuthService } from './auth.service.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { BadRequestError } from '../../utils/errors.js';

export const authRouter = Router();

authRouter.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const parseResult = LoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError('Invalid email or password.');
    }
    const result = await AuthService.login(parseResult.data);
    res.status(200).json(result);
  })
);

authRouter.post(
  '/signup',
  asyncHandler(async (req: Request, res: Response) => {
    const parseResult = SignupSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError('Name, email, company, and password are required.');
    }
    const result = await AuthService.signup(parseResult.data);
    res.status(201).json(result);
  })
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const parseResult = RefreshTokenSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError('Refresh token is required.');
    }
    const result = await AuthService.refresh(parseResult.data.refresh);
    res.status(200).json(result);
  })
);

authRouter.post(
  '/google',
  asyncHandler(async (req: Request, res: Response) => {
    const parseResult = GoogleLoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError('Invalid or expired Google credential.');
    }
    const result = await AuthService.googleLogin(parseResult.data);
    res.status(200).json(result);
  })
);
