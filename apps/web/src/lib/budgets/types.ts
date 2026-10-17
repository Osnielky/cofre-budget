export interface Category {
  id: string; name: string; icon: string; color: string; type: string;
  isFixed?: boolean; description?: string | null;
}
export interface ProjectCategory { id: string; name: string; icon: string; color: string }
export interface Project {
  id: string; name: string; icon: string; color?: string | null; type: string; status: string;
  categories?: ProjectCategory[];
}
export interface BudgetWithSpent {
  id: string; categoryId: string | null; category: Category | null; month?: string; sourceMonth?: string | null;
  amount: number; spent: number; percentage: number; remaining: number;
  projectId?: string | null; project?: Project | null;
  projectCategoryId?: string | null;
  notifyEnabled?: boolean; notifyThreshold?: number; rollover?: boolean; isRecurring?: boolean;
}
export interface BankAccount { id: string; accountName: string; bankName: string; accountType?: string }
export interface Transaction {
  id: string; name: string; amount: number; date: string;
  categoryRef: Category | null; bankAccount: BankAccount | null;
  /* Set when the row is a debt repayment — excluded from spend, like transfers. */
  debtId?: string | null;
}
export interface MonthSummary { month: string; total: number; count: number }
export interface HistoryPoint { month: string; budget: number; spent: number }
