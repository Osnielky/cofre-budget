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

  async findOrCreateByGoogle(profile: { id: string; email: string; name: string }): Promise<User> {
    let user = await this.repo.findOneBy({ googleId: profile.id });
    if (user) return user;

    user = await this.repo.findOneBy({ email: profile.email });
    if (user) {
      user.googleId = profile.id;
      if (!user.name) user.name = profile.name;
      user.emailVerified = true;
      return this.repo.save(user);
    }

    return this.repo.save(this.repo.create({
      googleId: profile.id,
      email: profile.email,
      name: profile.name,
      emailVerified: true,
    }));
  }
}
