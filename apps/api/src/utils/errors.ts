export class AppError extends Error {
  public readonly statusCode: number;
  public readonly detail: string;
  public readonly code?: string;
  public readonly errors?: unknown;
  public readonly missing?: string[];

  constructor(
    detail: string,
    statusCode = 500,
    code?: string,
    errors?: unknown,
    missing?: string[]
  ) {
    super(detail);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.detail = detail;
    this.code = code;
    this.errors = errors;
    this.missing = missing;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(detail = 'Bad request.', code?: string, errors?: unknown, missing?: string[]) {
    super(detail, 400, code, errors, missing);
  }
}

export class ValidationError extends AppError {
  constructor(detail = 'Validation error.', errors?: unknown, missing?: string[]) {
    super(detail, 400, undefined, errors, missing);
  }
}

export class UnauthorizedError extends AppError {
  constructor(detail = 'Authentication credentials were not provided.', code?: string) {
    super(detail, 401, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(detail = 'You do not have permission to perform this action.', code?: string) {
    super(detail, 403, code);
  }
}

export class NotFoundError extends AppError {
  constructor(detail = 'Not found.', code?: string) {
    super(detail, 404, code);
  }
}

export class MethodNotAllowedError extends AppError {
  constructor(detail = 'Method not allowed.', code?: string) {
    super(detail, 405, code);
  }
}

export class ConflictError extends AppError {
  constructor(detail = 'Resource conflict.', code?: string) {
    super(detail, 409, code);
  }
}
