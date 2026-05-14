import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BankAccount } from './bank-account.entity';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';

@Injectable()
export class BankAccountsService {
  constructor(
    @InjectRepository(BankAccount)
    private repo: Repository<BankAccount>,
  ) {}

  findAllByUser(userId: string): Promise<BankAccount[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'ASC' } });
  }

  create(userId: string, dto: CreateBankAccountDto): Promise<BankAccount> {
    const account = this.repo.create({ ...dto, userId });
    return this.repo.save(account);
  }

  async remove(id: string, userId: string): Promise<void> {
    const account = await this.repo.findOneBy({ id });
    if (!account) throw new NotFoundException();
    if (account.userId !== userId) throw new ForbiddenException();
    await this.repo.remove(account);
  }
}
