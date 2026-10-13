import { describe, it, expect } from 'vitest';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('AdminController', () => {
  it('protects every route with JwtAuthGuard then AdminGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminController)).toEqual([JwtAuthGuard, AdminGuard]);
  });

  it('passes search and page through to the service', async () => {
    const calls: unknown[] = [];
    const svc = { users: async (q: unknown) => { calls.push(q); return { rows: [], total: 0, page: 1, pageSize: 50 }; } };
    await new AdminController(svc as any).users('bob', '2');
    expect(calls).toEqual([{ search: 'bob', page: '2' }]);
  });

  it('drops array query params (repeated ?search=) instead of passing them on', async () => {
    const calls: unknown[] = [];
    const svc = { users: async (q: unknown) => { calls.push(q); return { rows: [], total: 0, page: 1, pageSize: 50 }; } };
    await new AdminController(svc as any).users(['a', 'b'], ['1', '2']);
    expect(calls).toEqual([{ search: undefined, page: undefined }]);
  });
});
