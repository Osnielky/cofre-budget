import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService, private usersService: UsersService) {
    const clientID = config.get<string>('GOOGLE_CLIENT_ID') ?? 'GOOGLE_CLIENT_ID_NOT_SET';
    const clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET') ?? 'GOOGLE_CLIENT_SECRET_NOT_SET';
    super({
      clientID,
      clientSecret,
      callbackURL: config.get<string>('GOOGLE_CALLBACK_URL', 'http://localhost:3333/api/auth/google/callback'),
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ) {
    const primary = profile.emails?.[0];
    const email: string | undefined = primary?.value;
    // Accounts are matched by email, so only an address Google has verified may
    // sign in or link to an existing account. A refusal (false) sends the user
    // back to /login?error=google via GoogleCallbackGuard.
    if (!email || primary?.verified === false) return done(null, false);
    try {
      const name      = profile.displayName || profile.name?.givenName || email;
      const avatarUrl = profile.photos?.[0]?.value;
      const user  = await this.usersService.findOrCreateByGoogle({ id: profile.id, email, name, avatarUrl });
      done(null, user);
    } catch (err) {
      done(err as Error, false);
    }
  }
}
