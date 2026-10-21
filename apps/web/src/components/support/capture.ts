import { toJpeg } from 'html-to-image';
import { MAX_SCREENSHOT_BYTES, dataUrlBytes } from '@/lib/support/report';

const QUALITY = 0.8;

/**
 * Snapshot of what the user sees right now, as a JPEG data URL. Elements with
 * `data-no-capture` (the report dialog itself) are left out. Throws when the
 * page cannot be rendered (cross-origin images, unsupported CSS); callers fall
 * back to an upload.
 */
export async function capturePage(): Promise<string> {
  const body = document.body;
  const bg = getComputedStyle(body).backgroundColor;
  const url = await toJpeg(body, {
    quality: QUALITY,
    pixelRatio: 1,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : '#0B1322',
    filter: (node) => !(node instanceof HTMLElement && node.hasAttribute('data-no-capture')),
  });
  return fitUnderLimit(url);
}

/** Reads a user-chosen image file as a data URL, re-encoding it to JPEG when it is too large. */
export async function readImageFile(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Choose a JPEG, PNG or WebP image.');
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read that file.'));
    r.readAsDataURL(file);
  });
  return fitUnderLimit(url);
}

/** Shrinks (quality, then size) until the image is under the API limit; throws when it cannot. */
export async function fitUnderLimit(dataUrl: string): Promise<string> {
  if (dataUrlBytes(dataUrl) <= MAX_SCREENSHOT_BYTES) return dataUrl;
  const img = await loadImage(dataUrl);
  let scale = 1;
  for (let attempt = 0; attempt < 6; attempt++) {
    const quality = attempt === 0 ? 0.7 : 0.6;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) break;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL('image/jpeg', quality);
    if (dataUrlBytes(out) <= MAX_SCREENSHOT_BYTES) return out;
    scale *= 0.75;
  }
  throw new Error('That image is too large. Choose a smaller one.');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = src;
  });
}
