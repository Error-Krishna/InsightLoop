import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.preprocess((val) => (typeof val === 'string' ? val.trim().toLowerCase() : val), z.string().email('A valid email address is required.')),
  password: z.string().min(1, 'Password is required.'),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const SignupSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  email: z.preprocess((val) => (typeof val === 'string' ? val.trim().toLowerCase() : val), z.string().email('A valid email address is required.')),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
  company: z.string().optional(),
  company_name: z.string().optional(),
}).refine(data => Boolean(data.company ?? data.company_name), {
  message: 'Please provide a company name.',
  path: ['company_name'],
});

export type SignupInput = z.infer<typeof SignupSchema>;

export const RefreshTokenSchema = z.object({
  refresh: z.string().min(1, 'Refresh token is required.'),
});

export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;

export const GoogleLoginSchema = z.object({
  credential: z.string().optional(),
  id_token: z.string().optional(),
}).refine(data => Boolean(data.credential ?? data.id_token), {
  message: 'Google credential or id_token is required.',
  path: ['credential'],
});

export type GoogleLoginInput = z.infer<typeof GoogleLoginSchema>;
