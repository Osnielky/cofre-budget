import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAdminEmail } from './admin-emails';

/**
 * Runs after JwtAuthGuard. Non-admins get a 404, not a 403, so admin routes
 * look exactly like routes that do not exist.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (!isAdminEmail(user?.email, this.config.get<string>('ADMIN_EMAILS'))) throw new NotFoundException();
    return true;
  }
}
