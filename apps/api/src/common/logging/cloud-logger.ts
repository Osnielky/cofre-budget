import { LoggerService } from '@nestjs/common';
import { log, errorFields, describeError, Severity } from './log';

/**
 * Nest LoggerService writing Cloud Logging JSON. Installed with app.useLogger(),
 * it turns every existing `new Logger(Name)` call into a structured entry.
 * Nest passes the logger name as the last string argument.
 */
export class CloudLogger implements LoggerService {
  log(message: unknown, ...params: unknown[]) { this.write('INFO', message, params); }
  warn(message: unknown, ...params: unknown[]) { this.write('WARNING', message, params); }
  debug(message: unknown, ...params: unknown[]) { this.write('DEBUG', message, params); }
  verbose(message: unknown, ...params: unknown[]) { this.write('DEBUG', message, params); }
  error(message: unknown, ...params: unknown[]) { this.write('ERROR', message, params); }
  fatal(message: unknown, ...params: unknown[]) { this.write('ERROR', message, params); }

  private write(severity: Severity, message: unknown, params: unknown[]) {
    const args = [...params];
    const last = args[args.length - 1];
    // A trailing plain string is the logger name — unless it is a stack trace.
    const context = typeof last === 'string' && !last.includes('\n') ? (args.pop() as string) : undefined;
    const fields: Record<string, unknown> = context ? { context } : {};

    if (severity === 'ERROR') {
      const cause = message instanceof Error ? message : args.find((a) => a instanceof Error || typeof a === 'string');
      Object.assign(fields, errorFields(cause ?? message));
      // e.g. Plaid's err.response.data: error_code, error_message, request_id.
      const details = args.filter((a) => a !== cause && !(a instanceof Error) && typeof a !== 'string');
      if (details.length) fields.details = details;
    } else if (args.length) {
      fields.details = args.map((a) => (a instanceof Error ? a.message : a));
    }
    log(severity, typeof message === 'string' ? message : describeError(message), fields);
  }
}
