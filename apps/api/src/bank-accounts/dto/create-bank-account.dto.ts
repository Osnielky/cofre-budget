export class CreateBankAccountDto {
  bankName: string;
  accountName: string;
  accountType?: string;
  balance?: number;
  currency?: string;
  color?: string;
  last4?: string;
}

/** The fields a client may set; everything else (id, userId, provider, Plaid ids) is server-owned. */
export const BANK_ACCOUNT_FIELDS = ['bankName', 'accountName', 'accountType', 'balance', 'currency', 'color', 'last4'] as const satisfies readonly (keyof CreateBankAccountDto)[];
