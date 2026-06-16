# Email/Password Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email/password signup, emailed verification (block until verified), and emailed password reset to Cofre, matching the existing Gilded Noir login UI, without disturbing Google OAuth.

**Architecture:** NestJS API issues stateless JWT links (verify: signed with `JWT_SECRET`; reset: signed with `JWT_SECRET + current password hash` for one-time use). Resend sends the emails. Next.js gets a shared `AuthShell` plus `/signup`, `/forgot-password`, `/reset-password` pages. OAuth/email config lives in `deploy/ci-deploy.sh` so it survives CI deploys.

**Tech Stack:** NestJS 11, TypeORM, `@nestjs/jwt`, `bcryptjs`, `resend`, Next.js 16 (App Router), Tailwind v4.

**Testing note:** No test runner exists. Each task verifies with `npx tsc` (type-check), `npm run build:*`, and manual smoke tests against `npm run dev` or the live dev deploy. Dev servers: `npm run dev:api` (:3333), `npm run dev:web` (:3000).

---

### Task 1: Add `resend` dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install with the build-image npm version**

Run (npm 10.8.2 keeps the lockfile compatible with the Docker build):
```bash
npx -y npm@10.8.2 install resend
```
Expected: `resend` added to `dependencies` in `package.json`, lockfile updated.

- [ ] **Step 2: Verify it resolves**

Run:
```bash
node -e "console.log(require('resend/package.json').version)"
```
Expected: prints a version number (e.g. `4.x`).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add resend for transactional email"
```

---

### Task 2: Add `emailVerified` to the User entity

**Files:**
- Modify: `apps/api/src/users/user.entity.ts`

- [ ] **Step 1: Add the column**

In `apps/api/src/users/user.entity.ts`, after the `plan` column add:
```ts
  @Column({ default: false })
  emailVerified: boolean;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p apps/api/tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/users/user.entity.ts
git commit -m "feat(api): add emailVerified column to User"
```

---

### Task 3: Extend UsersService for password accounts

**Files:**
- Modify: `apps/api/src/users/users.service.ts`

- [ ] **Step 1: Add lookup/create/update methods + mark Google users verified**

In `apps/api/src/users/users.service.ts`, add these methods to the class:
```ts
  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOneBy({ email });
  }

  // Loads the (normally select:false) password for token signing.
  findByIdWithPassword(id: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :id', { id })
      .getOne();
  }

  createWithPassword(data: { name: string; email: string; passwordHash: string }): Promise<User> {
    return this.repo.save(this.repo.create({
      name: data.name,
      email: data.email,
      password: data.passwordHash,
      emailVerified: false,
    }));
  }

  async markEmailVerified(id: string): Promise<void> {
    await this.repo.update(id, { emailVerified: true });
  }

  async setPassword(id: string, passwordHash: string): Promise<void> {
    await this.repo.update(id, { password: passwordHash });
  }
```

In the existing `findOrCreateByGoogle`, set `emailVerified: true` on both the link-existing and create-new paths. The create call becomes:
```ts
    return this.repo.save(this.repo.create({
      googleId: profile.id,
      email: profile.email,
      name: profile.name,
      emailVerified: true,
    }));
```
And when linking an existing email account to Google, add `user.emailVerified = true;` before `return this.repo.save(user);`.

- [ ] **Step 2: Type-check**

Run: `npx tsc -p apps/api/tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/users/users.service.ts
git commit -m "feat(api): UsersService methods for password accounts + verify Google users"
```

---

### Task 4: MailService (Resend wrapper)

**Files:**
- Create: `apps/api/src/mail/mail.service.ts`
- Create: `apps/api/src/mail/mail.module.ts`

- [ ] **Step 1: Create the service**

`apps/api/src/mail/mail.service.ts`:
```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend = new Resend(this.config.get<string>('RESEND_API_KEY') ?? '');
  private readonly from = this.config.get<string>('MAIL_FROM') ?? 'Cofre <onboarding@resend.dev>';

  constructor(private config: ConfigService) {}

  async sendVerification(to: string, name: string, link: string): Promise<void> {
    await this.send(to, 'Verify your Cofre account',
      `Welcome to Cofre${name ? ', ' + name : ''}!`,
      'Confirm your email to finish setting up your account.',
      'Verify email', link);
  }

  async sendPasswordReset(to: string, name: string, link: string): Promise<void> {
    await this.send(to, 'Reset your Cofre password',
      'Password reset',
      'We received a request to reset your password. This link expires in 1 hour. If you didn’t ask for this, ignore this email.',
      'Reset password', link);
  }

  private async send(to: string, subject: string, heading: string, body: string, cta: string, link: string): Promise<void> {
    try {
      await this.resend.emails.send({ from: this.from, to, subject, html: this.template(heading, body, cta, link) });
    } catch (err) {
      this.logger.error(`Failed to send "${subject}" to ${to}`, err as Error);
      throw err;
    }
  }

  private template(heading: string, body: string, cta: string, link: string): string {
    return `
<div style="background:#0B1322;padding:40px 0;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:480px;margin:0 auto;background:#141C32;border:1px solid #26314d;border-radius:16px;padding:36px 32px;color:#E8E6DF">
    <div style="font-size:13px;letter-spacing:0.28em;text-transform:uppercase;color:#DDB877;margin-bottom:20px">Cofre · Wealth &amp; Budget</div>
    <h1 style="font-size:22px;margin:0 0 12px;color:#F2F1EA">${heading}</h1>
    <p style="font-size:14px;line-height:1.6;color:#AeB4C2;margin:0 0 28px">${body}</p>
    <a href="${link}" style="display:inline-block;background:linear-gradient(180deg,#DDB877,#C9A05C);color:#131C30;font-weight:600;text-decoration:none;padding:13px 26px;border-radius:999px;font-size:13px;letter-spacing:0.06em">${cta}</a>
    <p style="font-size:11px;color:#6b7488;margin:28px 0 0;word-break:break-all">Or paste this link: ${link}</p>
  </div>
</div>`;
  }
}
```

- [ ] **Step 2: Create the module**

`apps/api/src/mail/mail.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -p apps/api/tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/mail/
git commit -m "feat(api): MailService wrapping Resend with branded templates"
```

---

### Task 5: Auth service — register, verify, reset, resend

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`

- [ ] **Step 1: Add token helpers and flows**

Replace the imports and class body of `apps/api/src/auth/auth.service.ts` with:
```ts
import { Injectable, ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
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
    if (!user?.password) return; // no account, or Google-only: silent (enumeration-safe)
    const token = this.jwtService.sign(
      { sub: user.id, purpose: 'reset' },
      { secret: this.jwtSecret + user.password, expiresIn: '1h' },
    );
    const link = `${this.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await this.mail.sendPasswordReset(user.email, user.name, link);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) throw new BadRequestException('Password must be at least 8 characters.');
    const decoded = this.jwtService.decode(token) as { sub?: string } | null;
    if (!decoded?.sub) throw new BadRequestException('Invalid or expired link.');
    const user = await this.usersService.findByIdWithPassword(decoded.sub);
    if (!user?.password) throw new BadRequestException('Invalid or expired link.');
    try {
      const payload = this.jwtService.verify<{ purpose: string }>(token, { secret: this.jwtSecret + user.password });
      if (payload.purpose !== 'reset') throw new Error('bad purpose');
    } catch {
      throw new BadRequestException('Invalid or expired link.');
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersService.setPassword(user.id, passwordHash);
  }

  // Used by the login controller to block unverified password accounts.
  isUnverifiedPasswordUser(user: User): boolean {
    return !!user.password && !user.emailVerified;
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p apps/api/tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/auth/auth.service.ts
git commit -m "feat(api): register/verify/reset/resend flows in AuthService"
```

---

### Task 6: Auth controller — endpoints, login gating, throttling

**Files:**
- Modify: `apps/api/src/auth/auth.controller.ts`

- [ ] **Step 1: Add endpoints and gate login**

In `apps/api/src/auth/auth.controller.ts`:

Add imports at top:
```ts
import { Controller, Post, Get, Body, Query, UseGuards, Request, Res, HttpCode } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
```

Inside the existing `login` handler, gate unverified users. Replace the body of `login` with:
```ts
  login(@Request() req: any, @Res() res: Response) {
    if (this.authService.isUnverifiedPasswordUser(req.user)) {
      return res.status(403).json({ code: 'EMAIL_UNVERIFIED', message: 'Please verify your email first.' });
    }
    const result = this.authService.login(req.user);
    res.cookie('access_token', result.access_token, COOKIE_OPTS);
    return res.json({ user: result.user });
  }
```

Add these handlers to the controller class:
```ts
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @Post('register')
  @HttpCode(200)
  async register(@Body() body: { name: string; email: string; password: string }) {
    await this.authService.register(body.name, body.email, body.password);
    return { message: 'Check your email to verify your account.' };
  }

  @SkipThrottle()
  @Get('verify-email')
  async verifyEmail(@Query('token') token: string, @Res() res: Response) {
    const redirectTo = await this.authService.verifyEmail(token ?? '');
    return res.redirect(redirectTo);
  }

  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() body: { email: string }) {
    await this.authService.requestPasswordReset(body.email);
    return { message: 'If that email exists, we sent a reset link.' };
  }

  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() body: { token: string; password: string }) {
    await this.authService.resetPassword(body.token, body.password);
    return { message: 'Password updated. You can sign in now.' };
  }

  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @Post('resend-verification')
  @HttpCode(200)
  async resendVerification(@Body() body: { email: string }) {
    await this.authService.resendVerification(body.email);
    return { message: 'If that account exists and is unverified, we sent a new link.' };
  }
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p apps/api/tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/auth/auth.controller.ts
git commit -m "feat(api): auth endpoints for register/verify/forgot/reset + verified login gate"
```

---

### Task 7: Wire MailModule into AuthModule

**Files:**
- Modify: `apps/api/src/auth/auth.module.ts`

- [ ] **Step 1: Import MailModule**

In `apps/api/src/auth/auth.module.ts`, add `import { MailModule } from '../mail/mail.module';` and add `MailModule` to the `imports` array. `ConfigModule` is global (registered in app.module) so `ConfigService` is already injectable.

- [ ] **Step 2: Build the API (catches DI wiring errors webpack-only)**

Run: `npm run build:api`
Expected: `Successfully ran target build for project api`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/auth/auth.module.ts
git commit -m "feat(api): wire MailModule into AuthModule"
```

---

### Task 8: API smoke test (local)

**Files:** none (verification task)

- [ ] **Step 1: Run the API with a dummy Resend key**

Run (in repo root, with the local Postgres running):
```bash
RESEND_API_KEY=dummy MAIL_FROM='Cofre <onboarding@resend.dev>' node dist/apps/api/main.js &
sleep 6
```

- [ ] **Step 2: Register a user**

Run:
```bash
curl -s -X POST http://localhost:3333/api/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"Test","email":"smoke+test@example.com","password":"hunter2pw"}'
```
Expected: `{"message":"Check your email..."}` (the Resend call will error/log with the dummy key — acceptable; the user is created). Verify the row exists:
```bash
psql -h localhost -U postgres -d cofre_budget -tAc "SELECT email, \"emailVerified\" FROM users WHERE email='smoke+test@example.com';"
```
Expected: `smoke+test@example.com|f`.

- [ ] **Step 3: Confirm unverified login is blocked**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3333/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"smoke+test@example.com","password":"hunter2pw"}'
```
Expected: `403`.

- [ ] **Step 4: Clean up**

```bash
psql -h localhost -U postgres -d cofre_budget -c "DELETE FROM users WHERE email='smoke+test@example.com';"
kill %1
```
No commit (verification only).

---

### Task 9: Extract AuthShell from the login page

**Files:**
- Create: `apps/web/src/components/AuthShell.tsx`

- [ ] **Step 1: Create AuthShell**

`apps/web/src/components/AuthShell.tsx` (backdrop + quote panel + glass card lifted verbatim from the current login page; children render inside the card):
```tsx
import React from 'react';

export const authInputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.13)',
  borderRadius: 'var(--radius-input)',
  color: '#F2F1EA',
};

export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex items-center justify-center min-h-dvh px-4 py-10 sm:py-14 overflow-x-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage: [
            'radial-gradient(120% 90% at 50% 50%, transparent 52%, rgba(4,8,16,0.60) 100%)',
            'radial-gradient(720px 540px at 32% 42%, rgba(201,160,92,0.10), transparent 62%)',
            'linear-gradient(180deg, rgba(5,9,18,0.38) 0%, rgba(5,9,18,0.16) 45%, rgba(5,9,18,0.68) 100%)',
            'url(/login-bg.jpg)',
          ].join(', '),
          backgroundSize: 'cover',
          backgroundPosition: 'center 68%',
          backgroundAttachment: 'fixed',
        }}
      />
      <div className="relative w-full max-w-6xl flex items-center justify-center lg:justify-between gap-12 lg:px-12">
        <div className="hidden lg:flex flex-col max-w-xl pb-10">
          <span className="text-[11px] uppercase mb-7" style={{ color: 'rgba(221,184,119,0.65)', letterSpacing: '0.34em' }}>
            Cofre · Wealth &amp; Budget
          </span>
          <p style={{
            fontFamily: 'var(--font-cormorant), "Cormorant Garamond", Georgia, serif',
            fontStyle: 'italic', fontWeight: 500, fontSize: 'clamp(40px, 4.2vw, 60px)',
            lineHeight: 1.18, letterSpacing: '0.01em',
            background: 'linear-gradient(115deg, #EED9AE 0%, #DDB877 38%, #C9A05C 68%, #A87F45 100%)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            textShadow: '0 0 60px rgba(201,160,92,0.18)',
          }}>
            “If you can’t measure it, you can’t improve it.”
          </p>
          <div className="rounded-full mt-8 mb-5" style={{ width: 56, height: 2, background: '#C9A05C', opacity: 0.8 }} />
          <span className="text-[11px] uppercase" style={{ color: 'rgba(242,241,234,0.45)', letterSpacing: '0.30em' }}>Peter Drucker</span>
        </div>

        <div
          className="relative w-full max-w-md lg:shrink-0 flex flex-col items-center px-6 sm:px-9 pt-11 pb-10 rounded-3xl"
          style={{
            background: 'linear-gradient(165deg, rgba(18,27,48,0.46) 0%, rgba(9,15,29,0.34) 100%)',
            backdropFilter: 'blur(26px) saturate(140%)', WebkitBackdropFilter: 'blur(26px) saturate(140%)',
            border: '1px solid rgba(255,255,255,0.13)',
            boxShadow: '0 30px 80px rgba(0,0,0,0.55), 0 0 90px rgba(201,160,92,0.07), inset 0 1px 0 rgba(255,255,255,0.12)',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p apps/web/tsconfig.json --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/AuthShell.tsx
git commit -m "feat(web): shared AuthShell (Gilded Noir auth layout)"
```

---

### Task 10: Refactor login page onto AuthShell + add links/states

**Files:**
- Modify: `apps/web/src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Rewrite the login page using AuthShell**

Replace `apps/web/src/app/(auth)/login/page.tsx` with a version that: imports `AuthShell` and `authInputStyle`, wraps the card contents (emblem, wordmark, form, divider, Google button) in `<AuthShell>`, reads `useSearchParams()` to show `?verified=1` ("Email verified — please sign in.") and `?error=verify` ("That link is invalid or expired."), shows the `EMAIL_UNVERIFIED` 403 response as an inline error with a "Resend verification email" button that POSTs to `/auth/resend-verification`, and adds two links below the form: `Create account` → `/signup` and `Forgot password?` → `/forgot-password`. Keep the existing emblem/wordmark/`Logo`/`GoogleIcon` markup and the `handleSubmit` POST to `/auth/login`; on a 403 response, parse JSON and if `code === 'EMAIL_UNVERIFIED'` set the unverified state instead of the generic error. Use `authInputStyle` for inputs. Wrap the component reading `useSearchParams` in a `<Suspense>` boundary (Next 16 requirement) — export a default that renders `<Suspense><LoginInner/></Suspense>`.

- [ ] **Step 2: Type-check + build**

Run: `npx tsc -p apps/web/tsconfig.json --noEmit && npm run build:web`
Expected: build succeeds; route list still shows `/login`.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(auth)/login/page.tsx"
git commit -m "feat(web): login on AuthShell with signup/forgot links + verify states"
```

---

### Task 11: Signup page

**Files:**
- Create: `apps/web/src/app/(auth)/signup/page.tsx`

- [ ] **Step 1: Create the signup page**

`apps/web/src/app/(auth)/signup/page.tsx` — a client component using `AuthShell` and `authInputStyle`, with fields name, email, password, confirm-password. Client validation: password ≥ 8 chars and password === confirm (show inline error otherwise). On submit POST `{ name, email, password }` to `${API}/auth/register` with `credentials: 'include'`; on success swap the card to a "Check your email" confirmation (heading + body + a "Back to sign in" link to `/login`); on 409 show "That email is already registered."; include a "Already have an account? Sign in" link to `/login`. Reuse the emblem/wordmark markup pattern from the login page. `const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';`

- [ ] **Step 2: Type-check + build**

Run: `npx tsc -p apps/web/tsconfig.json --noEmit && npm run build:web`
Expected: build succeeds; route list shows `/signup`.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(auth)/signup/page.tsx"
git commit -m "feat(web): signup page with confirm-password"
```

---

### Task 12: Forgot-password page

**Files:**
- Create: `apps/web/src/app/(auth)/forgot-password/page.tsx`

- [ ] **Step 1: Create the page**

`apps/web/src/app/(auth)/forgot-password/page.tsx` — client component in `AuthShell` with a single email field. On submit POST `{ email }` to `${API}/auth/forgot-password`; regardless of result, swap to "If that email exists, we sent a reset link." Include a "Back to sign in" link to `/login`.

- [ ] **Step 2: Type-check + build**

Run: `npx tsc -p apps/web/tsconfig.json --noEmit && npm run build:web`
Expected: build succeeds; route list shows `/forgot-password`.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(auth)/forgot-password/page.tsx"
git commit -m "feat(web): forgot-password page"
```

---

### Task 13: Reset-password page

**Files:**
- Create: `apps/web/src/app/(auth)/reset-password/page.tsx`

- [ ] **Step 1: Create the page**

`apps/web/src/app/(auth)/reset-password/page.tsx` — client component in `AuthShell` reading `token` via `useSearchParams` (wrap in `<Suspense>`), with new-password + confirm fields. Client validation: ≥ 8 chars and match. On submit POST `{ token, password }` to `${API}/auth/reset-password`; on success swap to "Password updated" with a "Sign in" link to `/login`; on 400 show "That link is invalid or expired — request a new one." with a link to `/forgot-password`.

- [ ] **Step 2: Type-check + build**

Run: `npx tsc -p apps/web/tsconfig.json --noEmit && npm run build:web`
Expected: build succeeds; route list shows `/reset-password`.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(auth)/reset-password/page.tsx"
git commit -m "feat(web): reset-password page"
```

---

### Task 14: Make the new auth routes public in middleware

**Files:**
- Modify: `apps/web/src/middleware.ts`

- [ ] **Step 1: Allow the public auth paths**

In `apps/web/src/middleware.ts`, replace the redirect condition so all auth pages are public. Define a constant and use it:
```ts
const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password'];
```
Change the guard from `pathname !== '/login'` to `!PUBLIC_PATHS.includes(pathname)`, and change the logged-in redirect-away check from `pathname === '/login'` to `pathname === '/login'` only (leave logged-in users free to hit the other auth pages, or also redirect them away from `/signup` — keep it to `/login` for simplicity). The verify-email path is under `/api` which the matcher already excludes.

- [ ] **Step 2: Type-check + build**

Run: `npx tsc -p apps/web/tsconfig.json --noEmit && npm run build:web`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/middleware.ts
git commit -m "fix(web): allow signup/forgot/reset pages without auth"
```

---

### Task 15: Add RESEND_API_KEY + MAIL_FROM to the deploy pipeline

**Files:**
- Modify: `deploy/ci-deploy.sh`
- Modify: `deploy/cloudbuild.yaml`

- [ ] **Step 1: ci-deploy.sh — add the env var and secret**

In `deploy/ci-deploy.sh`, in the API `gcloud run deploy` command:
- Append `,MAIL_FROM=${MAIL_FROM}` to the `--set-env-vars` value.
- Append `,RESEND_API_KEY=RESEND_API_KEY:latest` to the `--set-secrets` value.

Add `MAIL_FROM` to the input-vars comment at the top.

- [ ] **Step 2: cloudbuild.yaml — pass MAIL_FROM**

In `deploy/cloudbuild.yaml`:
- Under `substitutions:` add `_MAIL_FROM: Cofre <onboarding@resend.dev>` (swap to the verified domain address once Resend is verified).
- In the `deploy` step's `env:` block add `- 'MAIL_FROM=${_MAIL_FROM}'`.

- [ ] **Step 3: Verify shell + structure**

Run:
```bash
bash -n deploy/ci-deploy.sh && echo OK
grep -nE "RESEND_API_KEY|MAIL_FROM" deploy/ci-deploy.sh deploy/cloudbuild.yaml
```
Expected: `OK` and the new references present.

- [ ] **Step 4: Commit**

```bash
git add deploy/ci-deploy.sh deploy/cloudbuild.yaml
git commit -m "ci: pass RESEND_API_KEY + MAIL_FROM to the API deploy"
```

---

### Task 16: Provision Resend + secret, then deploy & verify (user-run)

**Files:** none (operational — user runs gcloud per their preference)

- [ ] **Step 1: Create the Resend account + API key**

User action: sign up at resend.com, create an API key. (For production: add `osmioservices.com` as a domain and create the DNS records Resend shows, then set `_MAIL_FROM` to `Cofre <no-reply@osmioservices.com>`. Until then, `onboarding@resend.dev` only delivers to the Resend account owner's email.)

- [ ] **Step 2: Store the key in Secret Manager + grant access**

```bash
printf 'YOUR_RESEND_KEY' | gcloud secrets create RESEND_API_KEY --data-file=-
gcloud secrets add-iam-policy-binding RESEND_API_KEY \
  --member="serviceAccount:193134215805-compute@developer.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor
```

- [ ] **Step 3: Push to deploy**

```bash
git push origin dev
# if the trigger doesn't fire: gcloud builds triggers run deploy-dev --branch=dev --region=us-central1
```

- [ ] **Step 4: Manual end-to-end test on the live URL**

On the canonical web URL (`gcloud run services describe cofre-web --region=us-central1 --format='value(status.url)'`):
1. Sign up → see "check your email" → receive verification email → click link → land on `/login?verified=1`.
2. Sign in → reaches the dashboard.
3. Before verifying a second test account, confirm login shows the "verify your email" state and "resend" works.
4. Forgot password → receive reset email → reset → sign in with the new password.
5. Confirm Google sign-in still works unchanged.

No commit (verification only).

---

## Self-Review

**Spec coverage:**
- Resend email → Tasks 1, 4, 15, 16. ✓
- `emailVerified` column + Google verified → Tasks 2, 3. ✓
- Register / verify / forgot / reset / resend endpoints → Tasks 5, 6. ✓
- Block-until-verified login → Task 6 (gate) + Task 8 (smoke). ✓
- Stateless JWT, reset bound to password hash → Task 5. ✓
- AuthShell + signup/forgot/reset pages + login links/states → Tasks 9–13. ✓
- Public auth routes → Task 14. ✓
- Deploy survives CI (RESEND_API_KEY/MAIL_FROM in ci-deploy.sh) → Task 15. ✓
- Manual test plan → Tasks 8, 16. ✓

**Placeholder scan:** Web page tasks (11–13) describe the page in prose rather than full JSX because they are near-identical compositions of the AuthShell + form pattern already shown fully in Tasks 9–10; the implementer has the exact shared styles (`authInputStyle`), the API base const, the endpoint contracts, and the field/validation rules. This is intentional to avoid duplicating ~150 lines of near-identical markup per page.

**Type consistency:** `findByEmailWithPassword` (existing) is the method used for both login and reset-request — Task 5 Step 1 includes a correction note flagging the wrong name. `findByIdWithPassword`, `createWithPassword`, `markEmailVerified`, `setPassword`, `findByEmail` are all defined in Task 3 and consumed in Task 5. `isUnverifiedPasswordUser` defined in Task 5, used in Task 6. `authInputStyle`/`AuthShell` defined in Task 9, used in 10–13. Verify token signed/verified with `JWT_SECRET`; reset token with `JWT_SECRET + password` — consistent across sign and verify.
