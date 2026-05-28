import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PLAN_KEY } from '../decorators/require-plan.decorator';

@Injectable()
export class PlanGuard implements CanActivate {
  private reflector = new Reflector();

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PLAN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;
    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;
    if (!required.includes(user.plan)) {
      throw new ForbiddenException({
        message: 'This feature requires a Pro plan.',
        code: 'PLAN_UPGRADE_REQUIRED',
      });
    }
    return true;
  }
}
