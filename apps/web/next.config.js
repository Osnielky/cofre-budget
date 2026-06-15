//@ts-check

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { composePlugins, withNx } = require('@nx/next');

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  nx: {},
  output: 'standalone',
  // Single-origin proxy: the browser only ever talks to the web domain.
  // Requests to /api/* are forwarded server-side to the API service, so the
  // auth cookie is scoped to the web domain (which the route-guard middleware
  // reads) instead of a separate API domain. API_PROXY_URL is a *runtime* env
  // var on the web Cloud Run service; left unset (local dev) the rewrite is a
  // no-op and the client falls back to calling the API directly on :3333.
  async rewrites() {
    const api = process.env.API_PROXY_URL;
    // beforeFiles → /api/* is proxied to the backend before any filesystem
    // route can shadow it, so the NestJS API always owns the /api namespace.
    return api
      ? { beforeFiles: [{ source: '/api/:path*', destination: `${api}/api/:path*` }] }
      : [];
  },
};

const plugins = [
  // Add more Next.js plugins to this list if needed.
  withNx,
];

module.exports = composePlugins(...plugins)(nextConfig);
