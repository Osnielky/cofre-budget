import { Injectable } from '@nestjs/common';
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
    return this.repo.findOneBy({ email: email.toLowerCase().trim() });
  }

  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email: email.toLowerCase().trim() })
      .getOne();
  }

  createLocal(data: { email: string; password: string; name?: string }): Promise<User> {
    return this.repo.save(this.repo.create({
      email: data.email.toLowerCase().trim(),
      password: data.password,
      name: data.name?.trim() || null as any,
      emailVerified: false,
    }));
  }

  async setPassword(userId: string, hashedPassword: string): Promise<void> {
    await this.repo.update({ id: userId }, { password: hashedPassword });
  }

  async markVerified(userId: string): Promise<void> {
    await this.repo.update({ id: userId }, { emailVerified: true });
  }

  async findOrCreateByGoogle(profile: { id: string; email: string; name: string }): Promise<User> {
    let user = await this.repo.findOneBy({ googleId: profile.id });
    if (user) return user;

    user = await this.repo.findOneBy({ email: profile.email });
    if (user) {
      user.googleId = profile.id;
      if (!user.name) user.name = profile.name;
      return this.repo.save(user);
    }

    return this.repo.save(this.repo.create({
      googleId: profile.id,
      email: profile.email,
      name: profile.name,
    }));
  }
}
