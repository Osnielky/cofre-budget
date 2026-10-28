/**
 * What to tell the user when POST /plaid/link-token fails. The API answers 403
 * with a code for plan gates; anything else is a connection problem.
 */
/** Thrown when the API refuses a new bank because the plan's institution cap is
 *  full. The API's message names the plan and the cap (Pro: upgrade to Elite;
 *  Elite: remove one first), so the UI shows it as-is. */
export class InstitutionLimitError extends Error {
  constructor(message?: unknown) {
    super(typeof message === 'string' && message ? message : 'You have reached the bank limit for your plan.');
    this.name = 'InstitutionLimitError';
  }
}

export function connectBankError(status: number, body: unknown): { message: string; upgrade: boolean } {
  const { code, message } = (body && typeof body === 'object' ? body : {}) as { code?: string; message?: string };
  if (status === 403 && code === 'PLAN_UPGRADE_REQUIRED') {
    return {
      upgrade: true,
      message: 'Automatic bank sync is a Pro feature. Upgrade to connect your bank — your accounts and imported transactions stay as they are.',
    };
  }
  if (status === 403 && code === 'DEMO_READ_ONLY') {
    return { upgrade: false, message: 'Bank connections are not available in the demo. Create a free account to connect your own bank.' };
  }
  if (status === 403 && code === 'INSTITUTION_LIMIT_REACHED') {
    return { upgrade: true, message: message ?? 'You have reached the bank limit for your plan.' };
  }
  return { upgrade: false, message: 'Could not open the bank connection. Please try again in a moment.' };
}
