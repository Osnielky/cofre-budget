import { describe, it, expect } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AdminJwtGuard } from './admin-jwt.guard';

describe('AdminJwtGuard.handleRequest', () => {
  const guard = new AdminJwtGuard();

  it('throws NotFoundException when there is no user', () => {
    expect(() => guard.handleRequest(null, false)).toThrow(NotFoundException);
    expect(() => guard.handleRequest(null, null)).toThrow(NotFoundException);
  });

  it('throws NotFoundException when passport reports an error', () => {
    expect(() => guard.handleRequest(new Error('jwt expired'), { id: 'u1' })).toThrow(NotFoundException);
  });

  it('returns the user otherwise', () => {
    const user = { id: 'u1' };
    expect(guard.handleRequest(null, user)).toBe(user);
  });
});
