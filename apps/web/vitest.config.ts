import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/lib/dashboard/**/*.test.ts', 'src/lib/receipts/**/*.test.ts', 'src/lib/budgets/**/*.test.ts', 'src/lib/transactions/**/*.test.ts', 'src/lib/projects/**/*.test.ts', 'src/lib/avatar.test.ts', 'src/lib/session-token.test.ts', 'src/lib/proxy-headers.test.ts', 'src/lib/web-vitals.test.ts', 'src/lib/report-body.test.ts', 'src/lib/security-headers.test.ts', 'src/lib/connect-bank-error.test.ts', 'src/lib/canonical-host.test.ts', 'src/lib/route-access.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
