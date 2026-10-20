import { SetMetadata } from '@nestjs/common';

export const BLOCKED_IN_DEMO_KEY = 'blockedInDemo';

/** Marks a route a public demo sandbox (User.isDemo) may not call: bank
 *  linking, billing, Gmail, account changes. Enforced by DemoGuard. */
export const BlockedInDemo = () => SetMetadata(BLOCKED_IN_DEMO_KEY, true);
