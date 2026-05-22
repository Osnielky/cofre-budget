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

  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
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
