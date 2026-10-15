import { Router } from 'express';
import { GoogleLoginSchema, LoginSchema, RefreshTokenSchema, SignupSchema } from '@insightloop/shared';
import { AuthController } from './auth.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validateRequest } from '../../middleware/validate.js';

export const authRouter = Router();

authRouter.post(
  '/login',
  validateRequest({
    body: LoginSchema,
    customErrorMessage: 'Invalid email or password.',
  }),
  asyncHandler(AuthController.login)
);

authRouter.post(
  '/signup',
  validateRequest({
    body: SignupSchema,
    customErrorMessage: 'Name, email, company, and password are required.',
  }),
  asyncHandler(AuthController.signup)
);

authRouter.post(
  '/refresh',
  validateRequest({
    body: RefreshTokenSchema,
    customErrorMessage: 'Refresh token is required.',
  }),
  asyncHandler(AuthController.refresh)
);

authRouter.post(
  '/google',
  validateRequest({
    body: GoogleLoginSchema,
    customErrorMessage: 'Invalid or expired Google credential.',
  }),
  asyncHandler(AuthController.google)
);
