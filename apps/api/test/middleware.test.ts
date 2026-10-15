import { describe, it, expect, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { z } from 'zod';
import { validateRequest } from '../src/middleware/validate.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  MethodNotAllowedError,
  InternalServerError,
} from '../src/utils/errors.js';

describe('Middleware & Error Classes Deep Unit Suite', () => {
  it('validates params, query, and body successfully', async () => {
    const testApp = express();
    testApp.use(express.json());

    testApp.post(
      '/test/:id',
      validateRequest({
        params: z.object({ id: z.string().regex(/^\d+$/) }),
        query: z.object({ filter: z.string().optional() }),
        body: z.object({ name: z.string() }),
      }),
      (req: Request, res: Response) => {
        res.json({ params: req.params, query: req.query, body: req.body });
      }
    );

    testApp.use(errorHandler);

    const res = await request(testApp)
      .post('/test/123?filter=active')
      .send({ name: 'Valid' });

    expect(res.status).toBe(200);
    expect(res.body.params.id).toBe('123');
    expect(res.body.query.filter).toBe('active');
    expect(res.body.body.name).toBe('Valid');
  });

  it('formats missing required fields without custom error message', async () => {
    const testApp = express();
    testApp.use(express.json());

    testApp.post(
      '/validate-missing',
      validateRequest({
        body: z.object({
          requiredField: z.string(),
          anotherField: z.number(),
        }),
      }),
      (_req: Request, res: Response) => {
        res.json({ ok: true });
      }
    );

    testApp.use(errorHandler);

    const res = await request(testApp)
      .post('/validate-missing')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('Missing required fields');
  });

  it('formats invalid field types when fields are present but malformed', async () => {
    const testApp = express();
    testApp.use(express.json());

    testApp.post(
      '/validate-type',
      validateRequest({
        body: z.object({
          age: z.number(),
        }),
      }),
      (_req: Request, res: Response) => {
        res.json({ ok: true });
      }
    );

    testApp.use(errorHandler);

    const res = await request(testApp)
      .post('/validate-type')
      .send({ age: 'not-a-number' });

    expect(res.status).toBe(400);
    expect(res.body.detail).toBeDefined();
  });

  it('passes non-Zod errors directly to next', async () => {
    const testApp = express();
    testApp.use(express.json());

    testApp.get(
      '/throws-error',
      validateRequest({
        query: {
          parseAsync: () => {
            throw new Error('Database connection failed');
          },
        } as unknown as z.ZodSchema,
      }),
      (_req: Request, res: Response) => {
        res.json({ ok: true });
      }
    );

    testApp.use(errorHandler);

    const res = await request(testApp).get('/throws-error');
    expect(res.status).toBe(500);
  });

  it('instantiates and handles all AppError subclasses', () => {
    expect(new BadRequestError('Bad').statusCode).toBe(400);
    expect(new UnauthorizedError('No Auth').statusCode).toBe(401);
    expect(new ForbiddenError('Forbidden').statusCode).toBe(403);
    expect(new NotFoundError('Not Found').statusCode).toBe(404);
    expect(new MethodNotAllowedError('Not Allowed').statusCode).toBe(405);
    expect(new ConflictError('Conflict').statusCode).toBe(409);
  });
});
