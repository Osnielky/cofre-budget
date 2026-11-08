import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

export const USER_CACHE_TTL_MS = 30_000;
const USER_CACHE_MAX = 1_000;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private repo: Repository<User>,
  ) {}

  findById(id: string): Promise<User | null> {
    // findOneBy drops undefined keys from the WHERE, which would return the first user.
    if (!id) return Promise.resolve(null);
    return this.repo.findOneBy({ id });
  }

  /* The JWT strategy's lookup. Every authenticated request used to cost one
     user query, and a page fires 7–10 at once, so a hit is kept for a short
     while. Writes through this service invalidate at once, and so do the
     writers of security-relevant columns elsewhere (billing plan changes, the
     demo wipe / owner reset). The remaining writers (Plaid user id, net-worth
     goal) read their own rows, never the cached one. The map is per instance
     and bounded: another instance serves its copy for at most USER_CACHE_TTL_MS. */
  private readonly cache = new Map<string, { user: User; expires: number }>();

  async findByIdCached(id: string, now: number = Date.now()): Promise<User | null> {
    if (!id) return null;
    const hit = this.cache.get(id);
    if (hit && hit.expires > now) return hit.user;
    const user = await this.findById(id);
    if (user) {
      if (this.cache.size >= USER_CACHE_MAX) this.cache.delete(this.cache.keys().next().value as string);
      this.cache.set(id, { user, expires: now + USER_CACHE_TTL_MS });
    } else {
      this.cache.delete(id);
    }
    return user;
  }

  invalidate(id: string): void {
    this.cache.delete(id);
  }

  /**
   * Records activity for admin "active users" counts. At most one write per user
   * per hour (the WHERE skips fresh rows), never bumps updatedAt, and never
   * rejects: callers fire and forget it.
   */
  async touchLastSeen(id: string, now: Date = new Date()): Promise<void> {
    try {
      await this.repo.createQueryBuilder()
        .update(User)
        .set({ lastSeenAt: now, updatedAt: () => '"updatedAt"' })
        .where('id = :id', { id })
        .andWhere('("lastSeenAt" IS NULL OR "lastSeenAt" < :stale)', { stale: new Date(now.getTime() - 60 * 60 * 1000) })
        .execute();
    } catch (err) {
      this.logger.warn(`touchLastSeen failed: ${(err as Error).message}`);
    }
  }

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOneBy({ email });
  }

  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
  }

  // Loads the (normally select:false) password for token signing.
  findByIdWithPassword(id: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :id', { id })
      .getOne();
  }

  createWithPassword(data: { name: string; email: string; passwordHash: string }): Promise<User> {
    return this.repo.save(this.repo.create({
      name: data.name,
      email: data.email,
      password: data.passwordHash,
      emailVerified: false,
    }));
  }

  async markEmailVerified(id: string): Promise<void> {
    await this.repo.update(id, { emailVerified: true });
    this.invalidate(id);
  }

  async setPassword(id: string, passwordHash: string): Promise<void> {
    await this.repo.update(id, { password: passwordHash });
    this.invalidate(id);
  }

  async findOrCreateByGoogle(profile: { id: string; email: string; name: string; avatarUrl?: string }): Promise<User> {
    let user = await this.repo.findOneBy({ googleId: profile.id });
    if (user) this.invalidate(user.id);
    if (user) {
      // Refresh the Google picture in case it changed.
      if (profile.avatarUrl && user.avatarUrl !== profile.avatarUrl) {
        user.avatarUrl = profile.avatarUrl;
        return this.repo.save(user);
      }
      return user;
    }

    user = await this.repo.findOneBy({ email: profile.email });
    if (user) {
      this.invalidate(user.id);
      // An unverified account's password and name were set by whoever
      // registered the address — possibly not its owner. Google has just
      // proven ownership, so that password must not keep working; the owner
      // can set one with "forgot password".
      if (!user.emailVerified) {
        await this.repo.update(user.id, { password: null as unknown as string });
        user.name = profile.name;
      }
      user.googleId = profile.id;
      if (!user.name) user.name = profile.name;
      if (!user.avatarUrl && profile.avatarUrl) user.avatarUrl = profile.avatarUrl;
      user.emailVerified = true;
      return this.repo.save(user);
    }

    return this.repo.save(this.repo.create({
      googleId: profile.id,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      emailVerified: true,
    }));
  }

  async updateProfile(id: string, data: { name?: string }): Promise<User> {
    const patch: Partial<User> = {};
    if (typeof data.name === 'string') patch.name = data.name.trim();
    if (Object.keys(patch).length) await this.repo.update(id, patch);
    this.invalidate(id);
    return this.repo.findOneByOrFail({ id });
  }
}
