/**
 * Which project category to suggest for a transaction.
 *
 * Suggestions mirror the user's own past behaviour: the server builds a map of
 * transaction name → the project category that name was last filed under (see
 * TransactionsService.getProjectHints), and this picks the entry for one row.
 */

export interface ProjectHint {
  projectId: string;
  projectCategoryId: string;
  catName: string;
  catIcon: string;
  catColor: string;
}

/** The only fields of a transaction that affect the suggestion. */
export interface SuggestionTx {
  name: string;
  categoryId: string | null;
  projectId: string | null;
  debtId: string | null;
}

/**
 * Drop a trailing confirmation code or long alphanumeric run, so the same
 * merchant with a per-purchase suffix still matches. Mirrors the normalisation
 * the API applies when it builds the hints.
 */
export function normalizeTxName(name: string): string {
  return name.replace(/\s+(?:conf#\S+|[A-Z0-9]{6,})$/i, '').trim();
}

export function pickProjectSuggestion(
  tx: SuggestionTx,
  hints: Record<string, ProjectHint>,
  isTransfer: boolean,
): ProjectHint | null {
  // An already-assigned budget category deliberately does NOT suppress this.
  // Parts and fuel almost always arrive pre-categorised — a categorization rule
  // or a name-pattern fallback gets there first — so bailing out on categoryId
  // hid the suggestion in exactly the case it was written for. Filing a row
  // under a project category clears its budget category anyway, so the two were
  // never really competing.
  if (tx.projectId || tx.debtId || isTransfer) return null;
  return hints[tx.name] ?? hints[normalizeTxName(tx.name)] ?? null;
}
