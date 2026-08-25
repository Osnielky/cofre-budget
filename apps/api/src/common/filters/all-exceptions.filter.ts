import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Catches everything that reaches Nest's exception layer. HttpExceptions pass
 * through with their own response body (only logged if 5xx); anything else is
 * an unexpected bug — its full stack goes to stderr (Cloud Run forwards this
 * to Cloud Logging, where GCP Error Reporting auto-detects and groups it) and
 * the client only ever sees a generic message, never the stack trace.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('UnhandledException');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) {
        this.logger.error(`${request.method} ${request.url} → ${status}`, exception.stack);
      }
      response.status(status).json(exception.getResponse());
      return;
    }

    this.logger.error(
      `${request.method} ${request.url} → 500`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
