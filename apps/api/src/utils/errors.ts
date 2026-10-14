export class AppError extends Error {
  public readonly statusCode: number;
  public readonly detail: string;
  public readonly code?: string;
  public readonly errors?: Record<string, any>;

  constructor(
    detail: string,
    statusCode: number = 500,
    code?: string,
    errors?: Record<string, any>
  ) {
    super(detail);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.detail = detail;
    this.code = code;
    this.errors = errors;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(detail: string = 'Bad request.', errors?: Record<string, any>) {
    super(detail, 400, undefined, errors);
  }
}

export class UnauthorizedError extends AppError {
  constructor(detail: string = 'Authentication credentials were not provided.', code?: string) {
    super(detail, 401, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(detail: string = 'You do not have permission to perform this action.') {
    super(detail, 403, undefined);
  }
}

export class NotFoundError extends AppError {
  constructor(detail: string = 'Not found.') {
    super(detail, 404, undefined);
  }
}

export class MethodNotAllowedError extends AppError {
  constructor(detail: string = 'Method not allowed.') {
    super(detail, 405, undefined);
  }
}

export class ValidationError extends AppError {
  constructor(detail: string = 'Validation error.', errors?: Record<string, any>) {
    super(detail, 400, undefined, errors);
  }
}
