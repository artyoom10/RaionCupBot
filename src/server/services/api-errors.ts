export class AppError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Недостаточно прав") {
    super(message, 403);
    this.name = "ForbiddenError";
  }
}
