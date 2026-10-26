import type { MetadataRoute } from 'next';
import { HOME_DESCRIPTION, SITE_NAME } from '@/lib/seo';

/** Web app manifest: lets phones add Cofre to the home screen with the right name,
    icon and colours. Next serves it at /manifest.webmanifest and links it from <head>. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — budget and net worth`,
    short_name: SITE_NAME,
    description: HOME_DESCRIPTION,
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0B1326',
    theme_color: '#0B1326',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
