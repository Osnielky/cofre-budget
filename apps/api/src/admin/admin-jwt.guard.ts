import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/* Anonymous visitors get 404 too, so /api/admin/* never reveals it exists. */
@Injectable()
export class AdminJwtGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(err: any, user: any): TUser {
    if (err || !user) throw new NotFoundException();
    return user;
  }
}
