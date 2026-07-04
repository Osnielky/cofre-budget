export interface Category {
  id: string; name: string; icon: string; color: string; type: string;
  isFixed?: boolean;
}
export interface BankAccount {
  id: string; bankName: string; accountName: string; accountType: string;
  color: string; balance: number; last4?: string;
}
export interface Transaction {
  id: string; name: string; amount: number; date: string; source: string;
  categoryRef: Category | null; bankAccount: BankAccount | null;
  projectId: string | null; debtId?: string | null;
}
export interface Budget {
  id: string; amount: number; spent: number; category: Category | null;
  projectCategoryId?: string | null;
}
export interface Project {
  id: string; name: string; icon: string; color: string; type: string; status: string;
  expenses: number; income: number; costBasis: number; netGain: number | null;
  roi: number | null; purchasePrice: number;
}
export interface Debt { remaining: number; status: 'open' | 'paid' }
