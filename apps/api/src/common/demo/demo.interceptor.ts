import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { BLOCKED_IN_DEMO_KEY } from './blocked-in-demo.decorator';
import { isDemoRestricted } from './demo-restricted';

/**
 * Registered globally (APP_INTERCEPTOR). Interceptors run after every guard,
 * so by the time this sees a request the route's JwtAuthGuard has already set
 * `req.user`; a global *guard* would run first and find it empty.
 *
 * Applies to visitor sandboxes AND the Rockefeller owner account: its password
 * is public (it appears in videos), so anyone can log in as it. Blocking bank
 * linking, billing, Gmail and account changes there keeps a stranger from
 * attaching real data, spending money or locking the owner out.
 */
@Injectable()
export class DemoInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const blocked = this.reflector.getAllAndOverride<boolean>(BLOCKED_IN_DEMO_KEY, [context.getHandler(), context.getClass()]);
    if (blocked) {
      const { user } = context.switchToHttp().getRequest();
      if (isDemoRestricted(user)) {
        throw new ForbiddenException({ message: 'Not available in the demo. Create a free account to use this.', code: 'DEMO_READ_ONLY' });
      }
    }
    return next.handle();
  }
}
