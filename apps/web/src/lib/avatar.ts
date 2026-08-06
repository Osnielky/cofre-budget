const AVATAR_COLORS = [
  'var(--color-card-violet)', 'var(--color-card-green)', 'var(--color-card-orange)',
  'var(--color-card-amber)', 'var(--color-card-sky)', 'var(--color-rose)',
];

/** Stable hash of a name to one of the fixed accent colors — used for merchant/person avatars. */
export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
}
