import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { User } from '../users/user.entity';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private config: ConfigService,
    private mail: MailService,
  ) {}

  private get jwtSecret(): string {
    return this.config.get<string>('JWT_SECRET') as string;
  }
  private get frontendUrl(): string {
    return this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
  }

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

  // Used by the login controller to block unverified password accounts.
  isUnverifiedPasswordUser(user: User): boolean {
    return !!user.password && !user.emailVerified;
  }

  async register(name: string, email: string, password: string): Promise<void> {
    if (password.length < 8) throw new BadRequestException('Password must be at least 8 characters.');
    const existing = await this.usersService.findByEmail(email);
    if (existing) throw new ConflictException('That email is already registered.');
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.usersService.createWithPassword({ name, email, passwordHash });
    await this.sendVerificationLink(user);
  }

  private async sendVerificationLink(user: User): Promise<void> {
    const token = this.jwtService.sign(
      { sub: user.id, purpose: 'verify' },
      { secret: this.jwtSecret, expiresIn: '24h' },
    );
    const link = `${this.frontendUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
    await this.mail.sendVerification(user.email, user.name, link);
  }

  async resendVerification(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (user && !user.emailVerified) await this.sendVerificationLink(user);
  }

  // Returns the FRONTEND_URL the controller should redirect to.
  async verifyEmail(token: string): Promise<string> {
    try {
      const payload = this.jwtService.verify<{ sub: string; purpose: string }>(token, { secret: this.jwtSecret });
      if (payload.purpose !== 'verify') throw new Error('bad purpose');
      await this.usersService.markEmailVerified(payload.sub);
      return `${this.frontendUrl}/login?verified=1`;
    } catch {
      return `${this.frontendUrl}/login?error=verify`;
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.usersService.findByEmailWithPassword(email);
    if (!user) return; // no account with that email: silent (enumeration-safe)
    // Google-only accounts have no password yet — reuse this flow to let them set one.
    const token = this.jwtService.sign(
      { sub: user.id, purpose: 'reset' },
      { secret: this.jwtSecret + (user.password ?? user.id), expiresIn: '1h' },
    );
    const link = `${this.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await this.mail.sendPasswordReset(user.email, user.name, link);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) throw new BadRequestException('Password must be at least 8 characters.');
    const decoded = this.jwtService.decode(token) as { sub?: string } | null;
    if (!decoded?.sub) throw new BadRequestException('Invalid or expired link.');
    const user = await this.usersService.findByIdWithPassword(decoded.sub);
    if (!user) throw new BadRequestException('Invalid or expired link.');
    try {
      const payload = this.jwtService.verify<{ purpose: string }>(token, {
        secret: this.jwtSecret + (user.password ?? user.id),
      });
      if (payload.purpose !== 'reset') throw new Error('bad purpose');
    } catch {
      throw new BadRequestException('Invalid or expired link.');
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersService.setPassword(user.id, passwordHash);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) throw new BadRequestException('Password must be at least 8 characters.');
    const user = await this.usersService.findByIdWithPassword(userId);
    if (!user?.password) {
      throw new BadRequestException('Your account signs in with Google and has no password to change.');
    }
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new BadRequestException('Current password is incorrect.');
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersService.setPassword(user.id, passwordHash);
  }
}
