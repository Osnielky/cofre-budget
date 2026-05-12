import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersService.findByEmailWithPassword(email);
    if (!user?.password) return null;
    const valid = await bcrypt.compare(password, user.password);
    return valid ? user : null;
  }

  login(user: User) {
    const { password: _p, ...safeUser } = user as any;
    return {
      access_token: this.jwtService.sign({ sub: user.id, email: user.email }),
      user: safeUser,
    };
  }
}
