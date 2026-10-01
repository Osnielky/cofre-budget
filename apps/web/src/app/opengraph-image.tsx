import { ImageResponse } from 'next/og';
import { HOME_HEADLINE, SITE_NAME } from '@/lib/seo';

// Satori renders this to a PNG and has no CSS variables, so the Cobalt theme's
// values are written out here. Keep them in step with globals.css :root.
export const alt = `${SITE_NAME} — ${HOME_HEADLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: '80px', color: '#E6EDF7',
          background: 'linear-gradient(165deg, #0F1B33 0%, #0B1220 55%, #090E1C 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 10.5V9A5.5 5.5 0 0 1 9 3.5h6A5.5 5.5 0 0 1 20.5 9v1.5" />
            <rect x="3.5" y="10.5" width="17" height="10" rx="1.8" />
            <rect x="10" y="8.6" width="4" height="4.8" rx="1.1" />
            <path d="M12 14.8v1.7" />
          </svg>
          <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: '0.06em' }}>{SITE_NAME}</div>
        </div>
        <div style={{ marginTop: 48, fontSize: 64, fontWeight: 700, lineHeight: 1.15, maxWidth: 980 }}>
          {HOME_HEADLINE}
        </div>
        <div style={{ marginTop: 28, fontSize: 30, color: '#94A3B8' }}>
          Bank sync · AI answers · Your path to $1M
        </div>
      </div>
    ),
    size,
  );
}
