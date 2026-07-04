import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private repo: Repository<User>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.repo.findOneBy({ id });
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
  }

  async setPassword(id: string, passwordHash: string): Promise<void> {
    await this.repo.update(id, { password: passwordHash });
  }

  async findOrCreateByGoogle(profile: { id: string; email: string; name: string; avatarUrl?: string }): Promise<User> {
    let user = await this.repo.findOneBy({ googleId: profile.id });
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

  async updateProfile(id: string, data: { name?: string; savingsGoal?: number | null }): Promise<User> {
    const patch: Partial<User> = {};
    if (typeof data.name === 'string') patch.name = data.name.trim();
    if (data.savingsGoal !== undefined) {
      if (data.savingsGoal === null) {
        patch.savingsGoal = null;
      } else {
        const n = Number(data.savingsGoal);
        if (!Number.isFinite(n) || n < 0) throw new BadRequestException('savingsGoal must be a non-negative number');
        patch.savingsGoal = n.toFixed(2);
      }
    }
    if (Object.keys(patch).length) await this.repo.update(id, patch);
    return this.repo.findOneByOrFail({ id });
  }
}
