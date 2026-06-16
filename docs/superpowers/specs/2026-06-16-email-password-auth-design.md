# Email/Password Authentication — Design

**Date:** 2026-06-16
**Status:** Approved
**Context:** Cofre currently supports Google OAuth only. Add classic email/password
auth with email verification and password recovery, without disturbing the
existing Google flow.

## Goal

Let users register with name + email + password, verify their email via a
mailed link before they can log in, and recover a forgotten password via a
mailed reset link. The UI must match the existing Gilded Noir login design.

## Decisions (settled during brainstorming)

- **Email provider:** Resend (API key in Secret Manager). `from` address on the
  verified `osmioservices.com` domain; dev can use `onboarding@resend.dev`.
- **Verification gating:** block — an unverified password account cannot log in.
- **Token mechanism:** stateless signed JWTs (no token table).
  - Verify token: JWT `{ sub, purpose: 'verify' }`, 24h expiry, signed with `JWT_SECRET`.
  - Reset token: JWT `{ sub, purpose: 'reset' }`, 1h expiry, signed with
    `JWT_SECRET + user's current password hash`. Changing the password
    invalidates the token → naturally single-use.
- **Shared UI shell:** extract the login page's backdrop + quote panel + glass
  card into `AuthShell` so all auth pages look identical.
- **Verify UX:** verify link marks the account verified and redirects to
  `/login?verified=1` ("Email verified — please sign in") rather than auto-login.

## Data model

Add one column to the `User` entity:

```
emailVerified: boolean  // @Column({ default: false })
```

- Email/password sign-ups start `false`.
- Google sign-ups set `true` in `findOrCreateByGoogle` (Google verifies the address).
- `synchronize: true` adds the column automatically on deploy.

## API (NestJS, `auth.controller`)

| Method & path | Body | Behaviour |
|---|---|---|
| `POST /auth/register` | `{ name, email, password }` | Validate; reject if email already exists; bcrypt-hash; create user (`emailVerified:false`); email a verification link. Returns 200 "check your email". Does **not** set the session cookie. |
| `GET /auth/verify-email?token=` | — | Validate verify JWT; set `emailVerified:true` (idempotent); redirect to `${FRONTEND_URL}/login?verified=1`. On bad/expired token redirect to `/login?error=verify`. |
| `POST /auth/forgot-password` | `{ email }` | If the account exists **and** has a password, email a reset link. **Always** returns 200 (no account enumeration). |
| `POST /auth/reset-password` | `{ token, password }` | Validate reset JWT (signed with old password hash); set new bcrypt hash. Returns 200. |
| `POST /auth/resend-verification` | `{ email }` | Re-send the verification link if an unverified account exists. Always 200. |

**Login change:** after `validateUser` succeeds, if the user has a password and
`emailVerified === false`, reject with a distinct 403 (`{ code: 'EMAIL_UNVERIFIED' }`)
so the frontend can show a "verify your email / resend link" state.

**Rate limiting:** apply a stricter throttle (e.g. 5 / 15 min, like login) to
`register`, `forgot-password`, `reset-password`, `resend-verification` via the
already-installed `@nestjs/throttler`.

**Validation:** email format; password min length 8; (confirm-password match is a
client concern — only one password reaches the API).

## Mail (`MailService`)

A small NestJS provider wrapping Resend's API (`RESEND_API_KEY` from config).
Two methods: `sendVerification(user, link)` and `sendPasswordReset(user, link)`.
Links built from `FRONTEND_URL`:
- verify: `${FRONTEND_URL}/api/auth/verify-email?token=…`
- reset: `${FRONTEND_URL}/reset-password?token=…`

HTML templates styled to match the brand (dark + champagne gold). `from` =
`MAIL_FROM` env (e.g. `Cofre <no-reply@osmioservices.com>`).

## Web (Next.js)

- **`AuthShell` component:** the night-sky backdrop, the left quote panel
  (`hidden lg:flex`), and the glass card container, extracted from the current
  login page. Children render inside the card. All auth pages use it.
- **`/signup`:** name, email, password, **confirm password** (match validated
  client-side + min length); on success shows "check your email".
- **`/forgot-password`:** email field; always shows "if that email exists, we
  sent a link".
- **`/reset-password?token=`:** new password + confirm; on success → login with
  a success notice.
- **Login page:** reuse `AuthShell`; add "Create account" and "Forgot password?"
  links; render `?verified=1` success and the `EMAIL_UNVERIFIED` error (with a
  "resend link" action).

## Config / secrets (must be added to the deploy pipeline)

Because CI's `ci-deploy.sh` uses `--set-env-vars`/`--set-secrets` (replace
semantics), these must be added there so they survive deploys:
- `RESEND_API_KEY` → Secret Manager → `--set-secrets`.
- `MAIL_FROM` → env var in `ci-deploy.sh`.

**Resend setup (user action):** verify `osmioservices.com` in Resend (DNS
records) for the production `from` address; until then dev uses
`onboarding@resend.dev` (delivers only to the account's own verified address).

## Security

- Enumeration-safe `forgot-password` / `resend-verification` (always 200).
- `register` returns a clear "email already registered" (minor enumeration trade
  accepted for UX).
- bcrypt hashing (reuse existing pattern).
- Token expiry: verify 24h, reset 1h; reset single-use via password-hash binding.
- Stricter rate limits on the new endpoints.
- Cookies unchanged (httpOnly, SameSite/secure per environment).

## Edge cases

- **Google-only user hits "forgot password":** no password to reset → no email
  sent, still returns 200. (Optionally later: allow them to *set* a password.)
- **Already-verified user clicks verify link again:** idempotent, redirects to login.
- **Register with an email that exists as a Google account:** rejected as
  "email already registered" (they should use Google, or we link later — out of scope).

## Out of scope (future)

- In-app password change while logged in.
- 2FA / MFA.
- Linking a Google account to set a password (and vice-versa).
- Email-change flow.

## Testing

No test runner is configured. Verify manually on the live dev deploy:
register → receive verification email → click link → log in; forgot-password →
receive reset email → reset → log in; unverified login is blocked; Google login
still works unchanged.
