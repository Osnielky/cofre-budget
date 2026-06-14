import {
  Injectable, ConflictException, BadRequestException,
  ForbiddenException, UnauthorizedException, Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { VerificationCode, CodeType } from './verification-code.entity';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';

const CODE_TTL_MS   = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS  = 5;
const MIN_PASSWORD  = 8;

/** Thrown when credentials are correct but the email is not yet verified. */
export class EmailNotVerifiedException extends ForbiddenException {
  constructor() {
    super({ message: 'Email not verified', code: 'EMAIL_NOT_VERIFIED' });
  }
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private mailService: MailService,
    @InjectRepository(VerificationCode) private codes: Repository<VerificationCode>,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersService.findByEmailWithPassword(email);
    if (!user?.password) return null;
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return null;
    if (!user.emailVerified) throw new EmailNotVerifiedException();
    return user;
  }

  login(user: User) {
    const { password: _p, ...safeUser } = user as any;
    return {
      access_token: this.jwtService.sign({ sub: user.id, email: user.email }),
      user: safeUser,
    };
  }

  // ── Registration ──────────────────────────────────────────────
  async register(email: string, password: string, name?: string): Promise<{ email: string }> {
    const normalized = email.toLowerCase().trim();
    if (!normalized.includes('@')) throw new BadRequestException('A valid email is required');
    if (!password || password.length < MIN_PASSWORD) {
      throw new BadRequestException(`Password must be at least ${MIN_PASSWORD} characters`);
    }

    const existing = await this.usersService.findByEmail(normalized);
    if (existing) {
      if (existing.emailVerified) throw new ConflictException('An account with this email already exists');
      // Unverified account exists — resend a fresh code instead of erroring.
      await this.issueCode(normalized, 'verify');
      return { email: normalized };
    }

    const hashed = await bcrypt.hash(password, 12);
    await this.usersService.createLocal({ email: normalized, password: hashed, name });
    await this.issueCode(normalized, 'verify');
    return { email: normalized };
  }

  async verifyEmail(email: string, code: string): Promise<{ user: any; access_token: string }> {
    const normalized = email.toLowerCase().trim();
    await this.consumeCode(normalized, 'verify', code);
    const user = await this.usersService.findByEmail(normalized);
    if (!user) throw new BadRequestException('Account not found');
    await this.usersService.markVerified(user.id);
    user.emailVerified = true;
    return this.login(user);
  }

  async resendCode(email: string): Promise<void> {
    const normalized = email.toLowerCase().trim();
    const user = await this.usersService.findByEmail(normalized);
    // Only (re)send for an existing, still-unverified account.
    if (user && !user.emailVerified) await this.issueCode(normalized, 'verify');
  }

  // ── Password reset ────────────────────────────────────────────
  async forgotPassword(email: string): Promise<void> {
    const normalized = email.toLowerCase().trim();
    const user = await this.usersService.findByEmail(normalized);
    // Always succeed silently — never reveal whether an account exists.
    if (user && user.emailVerified) await this.issueCode(normalized, 'reset');
    else if (user && !user.emailVerified) await this.issueCode(normalized, 'verify');
  }

  async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    const normalized = email.toLowerCase().trim();
    if (!newPassword || newPassword.length < MIN_PASSWORD) {
      throw new BadRequestException(`Password must be at least ${MIN_PASSWORD} characters`);
    }
    await this.consumeCode(normalized, 'reset', code);
    const user = await this.usersService.findByEmail(normalized);
    if (!user) throw new BadRequestException('Account not found');
    const hashed = await bcrypt.hash(newPassword, 12);
    await this.usersService.setPassword(user.id, hashed);
  }

  // ── Change password (authenticated) ───────────────────────────
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    if (!newPassword || newPassword.length < MIN_PASSWORD) {
      throw new BadRequestException(`Password must be at least ${MIN_PASSWORD} characters`);
    }
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException();
    const withPw = await this.usersService.findByEmailWithPassword(user.email);
    if (!withPw?.password) {
      throw new BadRequestException('This account has no password set (it uses Google sign-in)');
    }
    const ok = await bcrypt.compare(currentPassword, withPw.password);
    if (!ok) throw new BadRequestException('Current password is incorrect');
    const hashed = await bcrypt.hash(newPassword, 12);
    await this.usersService.setPassword(userId, hashed);
  }

  // ── Code helpers ──────────────────────────────────────────────
  private async issueCode(email: string, type: CodeType): Promise<void> {
    // Invalidate any outstanding codes of this type for the email.
    await this.codes.update({ email, type, consumed: false }, { consumed: true });
    // CSPRNG — codes gate email verification & password reset, so they must not be guessable.
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.codes.save(this.codes.create({
      email, code, type,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    }));
    if (type === 'verify') await this.mailService.sendVerificationCode(email, code);
    else await this.mailService.sendResetCode(email, code);
  }

  private async consumeCode(email: string, type: CodeType, code: string): Promise<void> {
    const record = await this.codes.findOne({
      where: { email, type, consumed: false },
      order: { createdAt: 'DESC' },
    });
    if (!record) throw new BadRequestException('No active code — request a new one');
    if (record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This code has expired — request a new one');
    }
    if (record.attempts >= MAX_ATTEMPTS) {
      record.consumed = true;
      await this.codes.save(record);
      throw new BadRequestException('Too many attempts — request a new code');
    }
    if (record.code !== code.trim()) {
      record.attempts += 1;
      await this.codes.save(record);
      throw new BadRequestException('Incorrect code');
    }
    record.consumed = true;
    await this.codes.save(record);
  }
}
