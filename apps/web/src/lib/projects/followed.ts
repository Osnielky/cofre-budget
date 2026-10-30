/* A trading project that follows an investment account already sees every row on it
   and every transfer to or from it through its Performance section (deposits,
   cash-outs, trades). Filing one of those under a project category would count the
   same money twice, so the picker hides the categories and explains why. The API
   enforces the same rule (ProjectsService.linkTransaction). */

export interface FollowedAccount { id: string; bankName: string; accountName: string }
export interface FollowingProject { accounts?: FollowedAccount[] | null }
export interface FollowableTx { bankAccountId: string | null; transferAccountId?: string | null }

/** The followed account a transaction sits on or moves money to / from, or null. */
export function followedAccountFor(project: FollowingProject, tx: FollowableTx): FollowedAccount | null {
  const accounts = project.accounts ?? [];
  if (accounts.length === 0) return null;
  return accounts.find((a) => a.id === tx.bankAccountId) ?? accounts.find((a) => !!tx.transferAccountId && a.id === tx.transferAccountId) ?? null;
}
