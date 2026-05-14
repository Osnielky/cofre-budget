export class CreateBankAccountDto {
  bankName: string;
  accountName: string;
  accountType?: string;
  balance?: number;
  currency?: string;
  color?: string;
}
