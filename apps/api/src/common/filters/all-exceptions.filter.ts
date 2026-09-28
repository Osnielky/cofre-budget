import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { log, errorFields, describeError } from '../logging/log';
import { currentRequestContext } from '../logging/request-context';

/**
 * Catches everything that reaches Nest's exception layer. 5xx and unexpected
 * errors are logged once with their stack in Error Reporting's format; a
 * handled 4xx adds its message to the request's log line instead. Clients
 * never see a stack trace.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const path = request.url.split('?')[0];

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) {
        log('ERROR', `${request.method} ${path} → ${status}: ${exception.message}`, errorFields(exception));
      } else {
        const reqCtx = currentRequestContext();
        if (reqCtx) reqCtx.error = exception.message;
      }
      response.status(status).json(exception.getResponse());
      return;
    }

    log('ERROR', `${request.method} ${path} → 500: ${describeError(exception)}`, errorFields(exception));
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      timestamp: new Date().toISOString(),
      path,
    });
  }
}
