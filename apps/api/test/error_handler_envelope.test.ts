import { describe, it, expect } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { ZodError, z } from 'zod';
import jwt from 'jsonwebtoken';
import { errorHandler, notFoundHandler } from '../src/middleware/errorHandler.js';
import { requestIdMiddleware } from '../src/middleware/requestId.js';
import { BadRequestError, NotFoundError } from '../src/utils/errors.js';

function createTestErrorApp() {
  const testApp = express();
  testApp.use(requestIdMiddleware);
  testApp.use(express.json());

  testApp.get('/error/app-error', () => {
    throw new BadRequestError('Custom bad request detail', 'CUSTOM_BAD_REQUEST');
  });

  testApp.get('/error/not-found', () => {
    throw new NotFoundError('Custom resource not found', 'RESOURCE_NOT_FOUND');
  });

  testApp.get('/error/zod', () => {
    const schema = z.object({ email: z.string().email() });
    schema.parse({ email: 'not-an-email' });
  });

  testApp.get('/error/mongo-duplicate', () => {
    const mongoErr = new Error('E11000 duplicate key error collection: InsightLoop.user index: email_1 dup key: { email: "dup@example.com" }') as Error & { code: number; keyPattern: Record<string, number> };
    mongoErr.name = 'MongoServerError';
    mongoErr.code = 11000;
    mongoErr.keyPattern = { email: 1 };
    throw mongoErr;
  });

  testApp.get('/error/jwt', () => {
    throw new jwt.JsonWebTokenError('invalid signature');
  });

  testApp.get('/error/jwt-expired', () => {
    throw new jwt.TokenExpiredError('jwt expired', new Date());
  });

  testApp.get('/error/multer-size', () => {
    const multerErr = new Error('File too large') as Error & { code: string; name: string };
    multerErr.name = 'MulterError';
    multerErr.code = 'LIMIT_FILE_SIZE';
    throw multerErr;
  });

  testApp.get('/error/body-parser-large', () => {
    const bpErr = new Error('request entity too large') as Error & { type: string; status: number };
    bpErr.type = 'entity.too.large';
    bpErr.status = 413;
    throw bpErr;
  });

  testApp.get('/error/unknown', () => {
    throw new Error('Secret database password leaked here');
  });

  testApp.use(notFoundHandler);
  testApp.use(errorHandler);

  return testApp;
}

describe('A5: Error Handler Leakage & Unified Envelope', () => {
  const app = createTestErrorApp();

  it('maps AppError subclasses to { detail, code, requestId }', async () => {
    const res = await request(app).get('/error/app-error');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('detail', 'Custom bad request detail');
    expect(res.body).toHaveProperty('code', 'CUSTOM_BAD_REQUEST');
    expect(res.body).toHaveProperty('requestId');
    expect(typeof res.body.requestId).toBe('string');
  });

  it('maps 404 not found handler to { detail, code, requestId }', async () => {
    const res = await request(app).get('/non-existent-route-for-testing');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('detail', 'Not found.');
    expect(res.body).toHaveProperty('code', 'NOT_FOUND');
    expect(res.body).toHaveProperty('requestId');
  });

  it('maps ZodError to 400 { detail, code, requestId }', async () => {
    const res = await request(app).get('/error/zod');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('detail');
    expect(res.body).toHaveProperty('code', 'VALIDATION_ERROR');
    expect(res.body).toHaveProperty('requestId');
  });

  it('maps Mongo duplicate-key 11000 to Django-compatible 400 { detail, code, requestId }', async () => {
    const res = await request(app).get('/error/mongo-duplicate');
    expect(res.status).toBe(400);
    expect(res.body.detail).toBe('Email already registered.');
    expect(res.body).toHaveProperty('code', 'DUPLICATE_KEY');
    expect(res.body).toHaveProperty('requestId');
  });

  it('maps JWT errors to 401 { detail, code, requestId }', async () => {
    const res1 = await request(app).get('/error/jwt');
    expect(res1.status).toBe(401);
    expect(res1.body).toHaveProperty('detail', 'Token is invalid or expired');
    expect(res1.body).toHaveProperty('code', 'token_not_valid');
    expect(res1.body).toHaveProperty('requestId');

    const res2 = await request(app).get('/error/jwt-expired');
    expect(res2.status).toBe(401);
    expect(res2.body).toHaveProperty('detail', 'Token is invalid or expired');
    expect(res2.body).toHaveProperty('code', 'token_not_valid');
    expect(res2.body).toHaveProperty('requestId');
  });

  it('maps Multer LIMIT_FILE_SIZE error to 413 { detail, code, requestId }', async () => {
    const res = await request(app).get('/error/multer-size');
    expect(res.status).toBe(413);
    expect(res.body).toHaveProperty('detail', 'File too large.');
    expect(res.body).toHaveProperty('code', 'FILE_TOO_LARGE');
    expect(res.body).toHaveProperty('requestId');
  });

  it('maps body-parser entity.too.large to 413 { detail, code, requestId }', async () => {
    const res = await request(app).get('/error/body-parser-large');
    expect(res.status).toBe(413);
    expect(res.body).toHaveProperty('detail', 'Payload too large.');
    expect(res.body).toHaveProperty('code', 'PAYLOAD_TOO_LARGE');
    expect(res.body).toHaveProperty('requestId');
  });

  it('maps malformed JSON syntax error to 400 { detail, code, requestId }', async () => {
    const res = await request(app)
      .post('/error/app-error')
      .set('Content-Type', 'application/json')
      .send('{ "bad": json');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('detail', 'Malformed JSON payload.');
    expect(res.body).toHaveProperty('code', 'MALFORMED_JSON');
    expect(res.body).toHaveProperty('requestId');
  });

  it('maps unknown errors to 500 without leaking stack traces or internal texts', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const res = await request(app).get('/error/unknown');
    process.env.NODE_ENV = originalEnv;

    expect(res.status).toBe(500);
    expect(res.body.detail).toBe('Internal server error.');
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
    expect(res.body).toHaveProperty('requestId');
    expect(res.body).not.toHaveProperty('stack');
    expect(JSON.stringify(res.body)).not.toContain('Secret database password leaked here');
  });
});
