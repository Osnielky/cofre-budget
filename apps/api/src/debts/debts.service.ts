import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Debt } from './debt.entity';
import { DebtPayment } from './debt-payment.entity';
import { MailService } from '../mail/mail.service';

export interface DebtWithBalance extends Debt {
  paid: number;
  remaining: number;
  percentage: number;
}
export interface CreateDebtDto {
  borrowerName: string;
  borrowerEmail?: string | null;
  principal: number;
  description?: string | null;
  dueDate?: string | null;
}
export interface PaymentDto {
  amount: number;
  date: string;
  note?: string | null;
  emailReceipt?: boolean;
}

@Injectable()
export class DebtsService {
  constructor(
    @InjectRepository(Debt) private debts: Repository<Debt>,
    @InjectRepository(DebtPayment) private payments: Repository<DebtPayment>,
    private mail: MailService,
  ) {}

  private async withBalance(debt: Debt): Promise<DebtWithBalance> {
    const raw = await this.payments.createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'paid')
      .where('p.debtId = :id', { id: debt.id })
      .getRawOne<{ paid: string }>();
    const paid = parseFloat(raw?.paid ?? '0');
    const principal = parseFloat(debt.principal as any);
    const remaining = principal - paid;
    const percentage = principal > 0 ? Math.round((paid / principal) * 100) : 0;
    return { ...debt, paid, remaining, percentage };
  }

  private async owned(id: string, userId: string): Promise<Debt> {
    const debt = await this.debts.findOneBy({ id });
    if (!debt) throw new NotFoundException();
    if (debt.userId !== userId) throw new ForbiddenException();
    return debt;
  }

  private async recomputeStatus(id: string, userId: string): Promise<DebtWithBalance> {
    const debt = await this.owned(id, userId);
    const wb = await this.withBalance(debt);
    const status = wb.remaining <= 0 ? 'paid' : 'open';
    if (status !== debt.status) {
      debt.status = status;
      await this.debts.save(debt);
      wb.status = status;
    }
    return wb;
  }

  async findAll(userId: string): Promise<DebtWithBalance[]> {
    const list = await this.debts.find({ where: { userId }, order: { createdAt: 'DESC' } });
    return Promise.all(list.map((d) => this.withBalance(d)));
  }

  async findOne(id: string, userId: string) {
    const debt = await this.owned(id, userId);
    const payments = await this.payments.find({ where: { debtId: id }, order: { date: 'DESC', createdAt: 'DESC' } });
    return { ...(await this.withBalance(debt)), payments };
  }

  async create(userId: string, dto: CreateDebtDto): Promise<DebtWithBalance> {
    if (!(dto.principal > 0)) throw new BadRequestException('Amount must be greater than zero.');
    const debt = await this.debts.save(this.debts.create({
      userId,
      borrowerName: dto.borrowerName,
      borrowerEmail: dto.borrowerEmail ?? null,
      principal: dto.principal,
      description: dto.description ?? null,
      dueDate: dto.dueDate ?? null,
      status: 'open',
    }));
    return this.withBalance(debt);
  }

  async update(id: string, userId: string, dto: Partial<CreateDebtDto>): Promise<DebtWithBalance> {
    const debt = await this.owned(id, userId);
    if (dto.principal !== undefined && !(dto.principal > 0)) throw new BadRequestException('Amount must be greater than zero.');
    debt.borrowerName = dto.borrowerName ?? debt.borrowerName;
    if (dto.borrowerEmail !== undefined) debt.borrowerEmail = dto.borrowerEmail;
    if (dto.principal !== undefined) debt.principal = dto.principal;
    if (dto.description !== undefined) debt.description = dto.description;
    if (dto.dueDate !== undefined) debt.dueDate = dto.dueDate;
    await this.debts.save(debt);
    return this.recomputeStatus(id, userId);
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.owned(id, userId);
    await this.debts.delete(id); // cascades payments
  }

  async addPayment(id: string, userId: string, lenderName: string, dto: PaymentDto): Promise<{ debt: DebtWithBalance; emailed: boolean }> {
    if (!(dto.amount > 0)) throw new BadRequestException('Payment must be greater than zero.');
    const debt = await this.owned(id, userId);
    await this.payments.save(this.payments.create({ debtId: id, amount: dto.amount, date: dto.date, note: dto.note ?? null }));
    const wb = await this.recomputeStatus(id, userId);
    let emailed = false;
    if (dto.emailReceipt && debt.borrowerEmail) {
      try {
        await this.mail.sendDebtReceipt(debt.borrowerEmail, debt.borrowerName, { lenderName, amountPaid: dto.amount, remaining: wb.remaining });
        emailed = true;
      } catch { emailed = false; } // email is a courtesy; never fail the payment write
    }
    return { debt: wb, emailed };
  }

  async removePayment(id: string, paymentId: string, userId: string): Promise<DebtWithBalance> {
    await this.owned(id, userId);
    await this.payments.delete({ id: paymentId, debtId: id });
    return this.recomputeStatus(id, userId);
  }

  async sendStatement(id: string, userId: string, lenderName: string): Promise<{ sent: boolean }> {
    const debt = await this.owned(id, userId);
    if (!debt.borrowerEmail) throw new BadRequestException('No borrower email on file.');
    const wb = await this.withBalance(debt);
    const payments = await this.payments.find({ where: { debtId: id }, order: { date: 'ASC' } });
    await this.mail.sendDebtStatement(debt.borrowerEmail, debt.borrowerName, {
      lenderName,
      principal: parseFloat(debt.principal as any),
      paid: wb.paid,
      remaining: wb.remaining,
      payments: payments.map((p) => ({ amount: parseFloat(p.amount as any), date: p.date })),
    });
    return { sent: true };
  }
}
