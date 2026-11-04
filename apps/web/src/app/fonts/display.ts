/* Fraunces, the serif display face of the landing and marketing pages, self-hosted.
   It used to come from next/font/google, but Google sometimes answers a fixed-weight
   request with instanced `l/font?kit=…&skey=…` URLs whose raw `&` breaks Turbopack's
   font loader ("next/font/google queries have exactly one entry") — a Cloud Build
   failed on 2026-11-04 while the same build passed locally. A file in the repo cannot
   change under us. Latin subset, variable opsz 9–144 / wght 100–900, SIL OFL 1.1
   (FRAUNCES-OFL.txt beside it). */
import localFont from 'next/font/local';

export const display = localFont({
  src: './fraunces-latin-variable.woff2',
  variable: '--font-display',
  display: 'swap',
  weight: '100 900',
  style: 'normal',
  preload: true,
});
