export interface Payment { id: string; amount: number; date: string; note: string | null; transactionId: string | null }

export interface Debt {
  id: string; borrowerName: string; borrowerEmail: string | null; principal: number;
  description: string | null; startDate: string | null; dueDate: string | null; status: 'open' | 'paid';
  paid: number; remaining: number; percentage: number; direction: 'lent' | 'owed';
}

export interface DebtDetail extends Debt { payments: Payment[] }
