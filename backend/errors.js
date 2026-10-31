export class AppError extends Error {
  constructor(code, status = 400, message = 'We could not complete this request.', retryAfter) {
    super(message); this.code = code; this.status = status; this.retryAfter = retryAfter;
  }
}
export function safeError(error) {
  return error instanceof AppError ? error : new AppError('SERVICE_ERROR', 502, 'Analysis is temporarily unavailable. Please try again later.');
}
