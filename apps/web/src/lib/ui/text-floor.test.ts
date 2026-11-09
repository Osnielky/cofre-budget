import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/* The readable-text floor (CLAUDE.md → Styling → "Text sizes"): anything a
   person must read is `text-fine` (11px desktop / 12px phones, a theme token in
   globals.css) or larger. An arbitrary `text-[Npx]` or inline `fontSize` under
   11px is refused here unless it is decorative: the line carries `aria-hidden`
   (a logo-like glyph), or the file is one of the pictures below. Decorative
   labels that must stay small use `text-badge` (10px). */

const FLOOR_PX = 11;        // inline / SVG sizes under this are refused
const CLASS_FLOOR_PX = 12;  // arbitrary text-[Npx] under this must be the `text-fine` token
const SRC = join(__dirname, '..', '..');

/** Files that are artwork, not text: screen readers skip them and nothing in them is the only copy of a fact. */
const DECORATIVE_FILES = [
  'app/(app)/cards/components/CardArt.tsx',   // the card graphic (aria-hidden wrapper)
];
const DECORATIVE_DIRS = [
  'components/landing/mockups/',              // fake-data pictures of the app on the landing page
];

const CLASS_RE = /text-\[(\d+(?:\.\d+)?)px\]/g;
const INLINE_RE = /fontSize(?::\s*|=\{?)['"]?(\d+(?:\.\d+)?)/g; // `fontSize: 10`, `fontSize="9"`, `fontSize={10.5}`

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(tsx|ts)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield full;
  }
}

function posix(p: string): string {
  return p.split(sep).join('/');
}

export function findSmallText(root = SRC): string[] {
  const hits: string[] = [];
  for (const file of walk(root)) {
    const rel = posix(relative(root, file));
    if (DECORATIVE_FILES.includes(rel) || DECORATIVE_DIRS.some((d) => rel.startsWith(d))) continue;
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (line.includes('aria-hidden')) return;
      for (const [re, floor] of [[CLASS_RE, CLASS_FLOOR_PX], [INLINE_RE, FLOOR_PX]] as const) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line))) {
          if (Number(m[1]) < floor) hits.push(`${rel}:${i + 1}  ${m[0]}`);
        }
      }
    });
  }
  return hits;
}

describe('readable text floor', () => {
  it(`has no text under ${FLOOR_PX}px outside decorative artwork`, () => {
    const hits = findSmallText();
    expect(hits, [
      'Text under 11px is hard to read, and 11px must be the token. Use `text-fine` (11px desktop / 12px phones) for anything',
      'a person must read, or `text-badge` (10px) for a decorative label that is also shown as',
      'readable text nearby or hidden on phones. A logo-like glyph may stay small with aria-hidden.',
      ...hits,
    ].join('\n')).toEqual([]);
  });

  it('catches both class and inline sizes in a sample', () => {
    const sample = `<p className="text-[9px]">a</p><span style={{ fontSize: 10, color: 'x' }}>b</span>
<i className="text-fine text-[11px]" /><text fontSize="9" /><text fontSize={10.5} fill="x" /><text fontSize={11} />
<b aria-hidden="true" className="text-[7px]">logo</b>`;
    const found: string[] = [];
    sample.split('\n').forEach((line) => {
      if (line.includes('aria-hidden')) return;
      for (const [re, floor] of [[CLASS_RE, CLASS_FLOOR_PX], [INLINE_RE, FLOOR_PX]] as const) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line))) if (Number(m[1]) < floor) found.push(m[1]);
      }
    });
    expect(found).toEqual(['9', '10', '11', '9', '10.5']);
  });
});
