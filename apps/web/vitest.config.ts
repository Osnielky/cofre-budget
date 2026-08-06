import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/lib/dashboard/**/*.test.ts', 'src/lib/receipts/**/*.test.ts', 'src/lib/budgets/**/*.test.ts', 'src/lib/avatar.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
