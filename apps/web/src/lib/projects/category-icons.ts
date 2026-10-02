/**
 * One-tap icon suggestions for a project's expense categories, by project type.
 * Every icon also appears in the full EmojiPicker, so it stays highlighted there.
 */
const QUICK_PICKS: Record<string, string[]> = {
  vehicle:  ['🔧', '⛽', '🛞', '🚗', '🔑', '🧰', '🅿️', '🧼', '📋', '💳'],
  property: ['🏠', '🔨', '🔧', '💡', '🔌', '🧹', '🛋️', '🪴', '🔑', '📋'],
  business: ['💼', '📦', '📊', '💻', '📱', '📋', '🏷️', '💳', '💵', '🛒'],
  trading:  ['📈', '📉', '💰', '💵', '🏦', '💻', '📊', '🪙', '💸', '📋'],
  other:    ['📦', '🛒', '🔧', '💡', '🎁', '📋', '💳', '🏷️', '🧰', '✨'],
};

export function quickPickIcons(projectType: string): string[] {
  if (projectType === 'service') return QUICK_PICKS.business;
  return QUICK_PICKS[projectType] ?? QUICK_PICKS.other;
}
