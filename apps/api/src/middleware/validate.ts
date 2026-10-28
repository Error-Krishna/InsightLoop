import type { Request, Response, NextFunction } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { BadRequestError, ValidationError } from '../utils/errors.js';

interface ValidationSchema {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
  customErrorMessage?: string;
}

export function validateRequest(schema: ValidationSchema) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schema.params) {
        req.params = (await schema.params.parseAsync(req.params)) as Record<string, string>;
      }
      if (schema.query) {
        req.query = (await schema.query.parseAsync(req.query)) as typeof req.query;
      }
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }
      next();
    } catch (err: unknown) {
      if (err instanceof ZodError) {
        if (schema.customErrorMessage) {
          next(new BadRequestError(schema.customErrorMessage));
          return;
        }

        const missing = err.issues
          .filter((i) => i.code === 'invalid_type' && ((i as unknown as { received?: string }).received === 'undefined' || i.message.includes('received undefined')))
          .map((i) => i.path.join('.'));

        const detail = missing.length > 0
          ? `Missing required fields: ${missing.join(', ')}`
          : err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');

        next(new ValidationError(detail, err.issues, missing.length > 0 ? missing : undefined));
      } else {
        next(err);
      }
    }
  };
}
