import { Router } from 'express';
import { GoogleLoginSchema, LoginSchema, RefreshTokenSchema, SignupSchema } from '@insightloop/shared';
import { AuthController } from './auth.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validateRequest } from '../../middleware/validate.js';
import { authIpRateLimiter, loginBruteForceLimiter } from '../../middleware/rateLimiter.js';

export const authRouter = Router();

authRouter.post(
  '/login',
  authIpRateLimiter,
  loginBruteForceLimiter,
  validateRequest({
    body: LoginSchema,
    customErrorMessage: 'Invalid email or password.',
  }),
  asyncHandler(AuthController.login)
);

authRouter.post(
  '/signup',
  authIpRateLimiter,
  validateRequest({
    body: SignupSchema,
    customErrorMessage: 'Name, email, company, and password are required.',
  }),
  asyncHandler(AuthController.signup)
);

authRouter.post(
  '/refresh',
  authIpRateLimiter,
  validateRequest({
    body: RefreshTokenSchema,
    customErrorMessage: 'Refresh token is required.',
  }),
  asyncHandler(AuthController.refresh)
);

authRouter.post(
  '/google',
  authIpRateLimiter,
  validateRequest({
    body: GoogleLoginSchema,
    customErrorMessage: 'Invalid or expired Google credential.',
  }),
  asyncHandler(AuthController.google)
);
