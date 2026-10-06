/** Parses #rgb / #rrggbb / rgb(r, g, b) into channels; null when unrecognised. */
function toRgb(color: string): [number, number, number] | null {
  const c = color.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((x) => x + x).join('') : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(c);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

/** "Redmean" perceptual distance — cheap and good enough to spot same-family colours. */
function distance(a: string, b: string): number {
  const x = toRgb(a), y = toRgb(b);
  if (!x || !y) return a.toLowerCase() === b.toLowerCase() ? 0 : Infinity;
  const rm = (x[0] + y[0]) / 2;
  const [dr, dg, db] = [x[0] - y[0], x[1] - y[1], x[2] - y[2]];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

/** Below this, two slice colours read as the same series on the dark surface. */
export const MIN_COLOR_DISTANCE = 120;

/**
 * Keeps each colour unless it is too close to one already used by an earlier
 * (larger) slice; then swaps in the first palette colour that is far enough from
 * everything used so far. Earlier entries win, so the biggest slices keep their
 * own category colour.
 */
export function distinctColors(colors: string[], palette: string[]): string[] {
  const used: string[] = [];
  const farFromUsed = (c: string) => used.every((u) => distance(c, u) >= MIN_COLOR_DISTANCE);
  return colors.map((color) => {
    const pick = farFromUsed(color) ? color
      : palette.find(farFromUsed)
        ?? palette.find((p) => !used.includes(p))
        ?? color;
    used.push(pick);
    return pick;
  });
}
