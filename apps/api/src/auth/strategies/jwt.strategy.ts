import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { Request } from 'express';
import { setRequestUser } from '../../common/logging/request-context';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.['access_token'] ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  // Every token the API signs shares JWT_SECRET, so the signature alone doesn't
  // make a token a session. Only login access tokens carry typ: 'access'.
  async validate(payload: { sub?: unknown; typ?: unknown }) {
    if (payload.typ !== 'access' || typeof payload.sub !== 'string' || !payload.sub) return null;
    const user = await this.usersService.findById(payload.sub);
    if (user) setRequestUser(user.id);
    return user;
  }
}
