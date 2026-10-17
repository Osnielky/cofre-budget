import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * The Google callback is a browser navigation, so a refused sign-in should land
 * on the login page, not a JSON 401. Lets the request through with no user and
 * the controller redirects.
 */
@Injectable()
export class GoogleCallbackGuard extends AuthGuard('google') {
  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err) throw err;
    return (user || null) as TUser;
  }
}
