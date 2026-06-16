# Personal Debts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track money the user lends out, log partial repayments, show remaining balances, and email borrowers a receipt (auto on payment) or statement (on demand).

**Architecture:** A `debts` NestJS module mirroring `projects` — `Debt` + `DebtPayment` entities, a service that computes balances the way `BudgetsService` computes "spent", a controller, and two new `MailService` methods reusing the existing Resend sender. A `/debts` Next.js page + sidebar item styled like budgets. Debts are a separate ledger (no budget/transaction coupling).

**Tech Stack:** NestJS 11, TypeORM, `@nestjs/jwt`, Resend (`MailService`), Next.js 16 App Router, Tailwind v4.

**Testing note:** No test runner. Each task verifies with `npx tsc`, `npm run build:*`, a local API smoke test, and manual checks on the live deploy. The email send must never fail the payment write.

---

### Task 1: Entities + register in DB config

**Files:**
- Create: `apps/api/src/debts/debt.entity.ts`
- Create: `apps/api/src/debts/debt-payment.entity.ts`
- Modify: `apps/api/src/config/database.config.ts`

- [ ] **Step 1: Create `debt.entity.ts`**
```ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('debts')
export class Debt {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() userId: string;
  @Column() borrowerName: string;
  @Column({ nullable: true }) borrowerEmail: string | null;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) principal: number;
  @Column({ nullable: true }) description: string | null;
  @Column({ type: 'date', nullable: true }) dueDate: string | null;
  @Column({ default: 'open' }) status: 'open' | 'paid';
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
```

- [ ] **Step 2: Create `debt-payment.entity.ts`**
```ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Debt } from './debt.entity';

@Entity('debt_payments')
export class DebtPayment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @ManyToOne(() => Debt, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'debtId' }) debt: Debt;
  @Column() debtId: string;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) amount: number;
  @Column({ type: 'date' }) date: string;
  @Column({ nullable: true }) note: string | null;
  @CreateDateColumn() createdAt: Date;
}
```

- [ ] **Step 3: Register both in `database.config.ts`** — add the imports after the ProjectCategory import:
```ts
import { Debt } from '../debts/debt.entity';
import { DebtPayment } from '../debts/debt-payment.entity';
```
and append `Debt, DebtPayment` to the `entities` array:
```ts
  entities: [User, BankAccount, PlaidItem, Transaction, Category, Budget, Project, ProjectCategory, Debt, DebtPayment],
```

- [ ] **Step 4: Type-check**

Run: `npx tsc -p apps/api/tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/debts/debt.entity.ts apps/api/src/debts/debt-payment.entity.ts apps/api/src/config/database.config.ts
git commit -m "feat(api): Debt + DebtPayment entities"
```

---

### Task 2: DebtsService

**Files:**
- Create: `apps/api/src/debts/debts.service.ts`

- [ ] **Step 1: Create the service**
```ts
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
```

- [ ] **Step 2: Type-check** (will error on the missing MailService methods — that's fine, Task 3 adds them; if it errors only on `sendDebtReceipt`/`sendDebtStatement`, proceed)

Run: `npx tsc -p apps/api/tsconfig.app.json --noEmit`
Expected: errors only about `sendDebtReceipt` / `sendDebtStatement` not existing on MailService. (Resolved in Task 3.)

- [ ] **Step 3: Commit**
```bash
git add apps/api/src/debts/debts.service.ts
git commit -m "feat(api): DebtsService (balances, payments, statements)"
```

---

### Task 3: MailService — receipt + statement

**Files:**
- Modify: `apps/api/src/mail/mail.service.ts`

- [ ] **Step 1: Add helpers + two methods.** At the bottom of the `MailService` class add the two public methods, and add the module-level helpers + a no-button template. Insert these helpers above the class (after the imports):
```ts
function money(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```
Add these two methods inside the class (after `sendPasswordReset`):
```ts
  async sendDebtReceipt(to: string, borrowerName: string, d: { lenderName: string; amountPaid: number; remaining: number }): Promise<void> {
    const body = `${esc(d.lenderName)} recorded your payment of <strong>${money(d.amountPaid)}</strong>.<br/><br/>`
      + `Remaining balance: <strong>${money(d.remaining)}</strong>.`;
    await this.sendPlain(to, 'Payment received', `Thank you${borrowerName ? ', ' + esc(borrowerName) : ''}!`, body);
  }

  async sendDebtStatement(to: string, borrowerName: string, d: { lenderName: string; principal: number; paid: number; remaining: number; payments: { amount: number; date: string }[] }): Promise<void> {
    const rows = d.payments
      .map((p) => `<tr><td style="padding:4px 0;color:#aeb4c2">${p.date}</td><td style="padding:4px 0;text-align:right;color:#E8E6DF">${money(p.amount)}</td></tr>`)
      .join('');
    const history = rows
      ? `<br/><br/><table style="width:100%;border-collapse:collapse;font-size:13px">`
        + `<tr><th align="left" style="color:#DDB877;padding-bottom:6px">Date</th><th align="right" style="color:#DDB877;padding-bottom:6px">Amount</th></tr>${rows}</table>`
      : '';
    const body = `Statement from ${esc(d.lenderName)}.<br/><br/>`
      + `Original amount: <strong>${money(d.principal)}</strong><br/>`
      + `Total paid: <strong>${money(d.paid)}</strong><br/>`
      + `Remaining balance: <strong>${money(d.remaining)}</strong>${history}`;
    await this.sendPlain(to, 'Your balance statement', `Statement for ${esc(borrowerName)}`, body);
  }

  private async sendPlain(to: string, subject: string, heading: string, bodyHtml: string): Promise<void> {
    try {
      await this.resend.emails.send({ from: this.from, to, subject, html: this.templatePlain(heading, bodyHtml) });
    } catch (err) {
      this.logger.error(`Failed to send "${subject}" to ${to}`, err as Error);
      throw err;
    }
  }

  private templatePlain(heading: string, bodyHtml: string): string {
    return `
<div style="background:#0B1322;padding:40px 0;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:480px;margin:0 auto;background:#141C32;border:1px solid #26314d;border-radius:16px;padding:36px 32px;color:#E8E6DF">
    <div style="font-size:13px;letter-spacing:0.28em;text-transform:uppercase;color:#DDB877;margin-bottom:20px">Cofre &middot; Wealth &amp; Budget</div>
    <h1 style="font-size:22px;margin:0 0 14px;color:#F2F1EA">${heading}</h1>
    <div style="font-size:14px;line-height:1.7;color:#cfd4de">${bodyHtml}</div>
  </div>
</div>`;
  }
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p apps/api/tsconfig.app.json --noEmit`
Expected: no errors (the Task 2 errors are now resolved).

- [ ] **Step 3: Commit**
```bash
git add apps/api/src/mail/mail.service.ts
git commit -m "feat(api): debt receipt + statement emails"
```

---

### Task 4: DebtsController + module + app wiring

**Files:**
- Create: `apps/api/src/debts/debts.controller.ts`
- Create: `apps/api/src/debts/debts.module.ts`
- Modify: `apps/api/src/app/app.module.ts`

- [ ] **Step 1: Create the controller**
```ts
import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DebtsService, CreateDebtDto, PaymentDto } from './debts.service';

@UseGuards(JwtAuthGuard)
@Controller('debts')
export class DebtsController {
  constructor(private service: DebtsService) {}

  @Get() list(@Request() req: any) { return this.service.findAll(req.user.id); }
  @Get(':id') one(@Param('id') id: string, @Request() req: any) { return this.service.findOne(id, req.user.id); }
  @Post() create(@Request() req: any, @Body() dto: CreateDebtDto) { return this.service.create(req.user.id, dto); }
  @Patch(':id') update(@Param('id') id: string, @Request() req: any, @Body() dto: Partial<CreateDebtDto>) { return this.service.update(id, req.user.id, dto); }
  @Delete(':id') remove(@Param('id') id: string, @Request() req: any) { return this.service.remove(id, req.user.id); }

  @Post(':id/payments')
  addPayment(@Param('id') id: string, @Request() req: any, @Body() dto: PaymentDto) {
    return this.service.addPayment(id, req.user.id, req.user.name || req.user.email, dto);
  }

  @Delete(':id/payments/:pid')
  removePayment(@Param('id') id: string, @Param('pid') pid: string, @Request() req: any) {
    return this.service.removePayment(id, pid, req.user.id);
  }

  @Post(':id/send-statement')
  sendStatement(@Param('id') id: string, @Request() req: any) {
    return this.service.sendStatement(id, req.user.id, req.user.name || req.user.email);
  }
}
```

- [ ] **Step 2: Create the module**
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Debt } from './debt.entity';
import { DebtPayment } from './debt-payment.entity';
import { DebtsService } from './debts.service';
import { DebtsController } from './debts.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [TypeOrmModule.forFeature([Debt, DebtPayment]), MailModule],
  controllers: [DebtsController],
  providers: [DebtsService],
})
export class DebtsModule {}
```

- [ ] **Step 3: Wire into `app.module.ts`** — add `import { DebtsModule } from '../debts/debts.module';` with the other module imports, and add `DebtsModule` to the `imports` array (after `ProjectsModule`).

- [ ] **Step 4: Build the API** (catches DI/webpack issues)

Run: `npm run build:api`
Expected: `Successfully ran target build for project api`.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/debts/debts.controller.ts apps/api/src/debts/debts.module.ts apps/api/src/app/app.module.ts
git commit -m "feat(api): debts controller + module wiring"
```

---

### Task 5: Local API smoke test

**Files:** none (verification)

- [ ] **Step 1: Start the built API on port 3334** (3333 may be the dev server)
```bash
PORT=3334 RESEND_API_KEY=dummy MAIL_FROM='Cofre <onboarding@resend.dev>' node -r dotenv/config dist/apps/api/main.js > /tmp/cofre-debts-smoke.log 2>&1 &
```
Wait for boot with a retrying curl (no sleep):
```bash
curl -s --retry 15 --retry-connrefused --retry-delay 1 -o /dev/null -w "boot %{http_code}\n" http://localhost:3334/api/auth/me
```
Expected: `boot 401`.

- [ ] **Step 2: Mint a JWT for an existing user + create a debt**
```bash
USER_ID=$(psql -h localhost -U postgres -d cofre_budget -tAc "SELECT id FROM users LIMIT 1")
TOKEN=$(node -e "require('dotenv').config();console.log(require('jsonwebtoken').sign({sub:'$USER_ID',email:'t'},process.env.JWT_SECRET,{expiresIn:'5m'}))")
DEBT=$(curl -s -X POST http://localhost:3334/api/debts -H 'Content-Type: application/json' -b "access_token=$TOKEN" -d '{"borrowerName":"Smoke","principal":100}')
echo "$DEBT"
```
Expected: JSON with `"principal":100`, `"paid":0`, `"remaining":100`, `"percentage":0`, `"status":"open"`.

- [ ] **Step 3: Record a payment, expect remaining 60 and status open**
```bash
DID=$(node -e "console.log(JSON.parse(process.argv[1]).id)" "$DEBT")
curl -s -X POST http://localhost:3334/api/debts/$DID/payments -H 'Content-Type: application/json' -b "access_token=$TOKEN" -d '{"amount":40,"date":"2026-06-16","emailReceipt":false}'
```
Expected: `{"debt":{...,"paid":40,"remaining":60,"status":"open"...},"emailed":false}`.

- [ ] **Step 4: Pay it off, expect status paid**
```bash
curl -s -X POST http://localhost:3334/api/debts/$DID/payments -H 'Content-Type: application/json' -b "access_token=$TOKEN" -d '{"amount":60,"date":"2026-06-16","emailReceipt":false}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const r=JSON.parse(d);console.log('remaining',r.debt.remaining,'status',r.debt.status)})"
```
Expected: `remaining 0 status paid`.

- [ ] **Step 5: Clean up + stop the API**
```bash
curl -s -o /dev/null -X DELETE http://localhost:3334/api/debts/$DID -b "access_token=$TOKEN"
kill %1 2>/dev/null || PID=$(lsof -nP -iTCP:3334 -sTCP:LISTEN -t); kill $PID 2>/dev/null
```
No commit (verification only).

---

### Task 6: Web — `/debts` page + sidebar nav

**Files:**
- Create: `apps/web/src/app/debts/page.tsx`
- Modify: `apps/web/src/components/Sidebar.tsx`

- [ ] **Step 1: Add the nav item in `Sidebar.tsx`** — add to the `NAV` array (after Projects):
```tsx
  { label: 'Debts',        href: '/debts',        icon: DebtsIcon },
```
and add this icon component near the other icon functions:
```tsx
function DebtsIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  );
}
```

- [ ] **Step 2: Create `apps/web/src/app/debts/page.tsx`**
```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Sidebar from '@/components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Payment { id: string; amount: number; date: string; note: string | null }
interface Debt {
  id: string; borrowerName: string; borrowerEmail: string | null; principal: number;
  description: string | null; dueDate: string | null; status: 'open' | 'paid';
  paid: number; remaining: number; percentage: number;
}
interface DebtDetail extends Debt { payments: Payment[] }

function fmt(n: number) { return Math.abs(Number(n)).toLocaleString('en-US', { minimumFractionDigits: 2 }); }
function today() { return new Date().toISOString().slice(0, 10); }

export default function DebtsPage() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ borrowerName: '', borrowerEmail: '', principal: '', description: '', dueDate: '' });
  const [saving, setSaving] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DebtDetail | null>(null);
  const [pay, setPay] = useState({ amount: '', date: today(), note: '', emailReceipt: true });
  const [toast, setToast] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/debts`, { credentials: 'include' })
      .then(r => r.json()).then(d => setDebts(Array.isArray(d) ? d : []))
      .catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadDetail = useCallback((id: string) => {
    fetch(`${API}/debts/${id}`, { credentials: 'include' }).then(r => r.json()).then(setDetail).catch(() => {});
  }, []);
  useEffect(() => { if (openId) loadDetail(openId); else setDetail(null); }, [openId, loadDetail]);

  const totalLent = debts.reduce((s, d) => s + Number(d.principal), 0);
  const totalRepaid = debts.reduce((s, d) => s + Number(d.paid), 0);
  const outstanding = debts.filter(d => d.status === 'open').reduce((s, d) => s + Number(d.remaining), 0);
  const peopleOwing = debts.filter(d => d.status === 'open').length;

  async function createDebt(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch(`${API}/debts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({
        borrowerName: form.borrowerName,
        borrowerEmail: form.borrowerEmail || null,
        principal: parseFloat(form.principal),
        description: form.description || null,
        dueDate: form.dueDate || null,
      }),
    });
    setSaving(false); setShowForm(false);
    setForm({ borrowerName: '', borrowerEmail: '', principal: '', description: '', dueDate: '' });
    load();
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!openId) return;
    const res = await fetch(`${API}/debts/${openId}/payments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ amount: parseFloat(pay.amount), date: pay.date, note: pay.note || null, emailReceipt: pay.emailReceipt }),
    });
    const data = await res.json().catch(() => null);
    setPay({ amount: '', date: today(), note: '', emailReceipt: true });
    if (data?.emailed) { setToast('Receipt emailed'); setTimeout(() => setToast(''), 3000); }
    loadDetail(openId); load();
  }

  async function deletePayment(pid: string) {
    if (!openId) return;
    await fetch(`${API}/debts/${openId}/payments/${pid}`, { method: 'DELETE', credentials: 'include' });
    loadDetail(openId); load();
  }

  async function sendStatement() {
    if (!openId) return;
    const res = await fetch(`${API}/debts/${openId}/send-statement`, { method: 'POST', credentials: 'include' });
    setToast(res.ok ? 'Statement emailed' : 'Could not send'); setTimeout(() => setToast(''), 3000);
  }

  async function deleteDebt(id: string) {
    await fetch(`${API}/debts/${id}`, { method: 'DELETE', credentials: 'include' });
    if (openId === id) setOpenId(null);
    load();
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20 px-6 pt-5 pb-4 flex items-center justify-between gap-4 flex-wrap"
          style={{ background: 'var(--header-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Debts</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Money you lent out</p>
          </div>
          <button onClick={() => setShowForm(true)}
            className="px-4 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 transition-all flex items-center gap-1.5"
            style={{ background: 'var(--color-card-violet)' }}>
            <span className="text-base leading-none">+</span> Add Debt
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5">
          {!loading && debts.length > 0 && (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {[
                { label: 'Total Lent', value: `$${fmt(totalLent)}`, color: 'var(--color-card-violet)' },
                { label: 'Total Repaid', value: `$${fmt(totalRepaid)}`, color: 'var(--color-green)' },
                { label: 'Outstanding', value: `$${fmt(outstanding)}`, color: 'var(--color-orange)' },
                { label: 'People Owing', value: `${peopleOwing}`, color: 'var(--color-card-sky)' },
              ].map(s => (
                <div key={s.label} className="p-4 rounded-2xl flex flex-col gap-1.5"
                  style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--color-border)' }}>
                  <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: s.color }}>{s.label}</span>
                  <span className="text-xl font-extrabold leading-none tabular-nums">{s.value}</span>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <p className="text-xs text-center py-12" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
          ) : debts.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-4 text-center rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <span className="text-5xl opacity-30">🤝</span>
              <div>
                <p className="font-semibold text-base">No debts tracked</p>
                <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>Record money you lent so you can track repayments.</p>
              </div>
              <button onClick={() => setShowForm(true)} className="mt-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl hover:brightness-110" style={{ background: 'var(--color-card-violet)' }}>+ Add Your First Debt</button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {debts.map(d => {
                const open = openId === d.id;
                const pct = Math.min(d.percentage, 100);
                return (
                  <div key={d.id} className="rounded-2xl overflow-hidden transition-all"
                    style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--color-border)' }}>
                    <div role="button" tabIndex={0} className="w-full text-left p-5 cursor-pointer"
                      onClick={() => setOpenId(open ? null : d.id)}
                      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpenId(open ? null : d.id); } }}>
                      <div className="flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm">{d.borrowerName}</p>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={d.status === 'paid'
                                ? { background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', color: 'var(--color-green)' }
                                : { background: 'color-mix(in srgb, var(--color-amber) 15%, transparent)', color: 'var(--color-amber)' }}>
                              {d.status === 'paid' ? 'PAID' : 'OPEN'}
                            </span>
                          </div>
                          <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: 'var(--color-green)' }} />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Remaining</p>
                          <p className="text-lg font-extrabold tabular-nums" style={{ color: d.remaining > 0 ? 'var(--color-orange)' : 'var(--color-green)' }}>${fmt(d.remaining)}</p>
                          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>of ${fmt(d.principal)}</p>
                        </div>
                      </div>
                    </div>

                    {open && detail && detail.id === d.id && (
                      <div className="px-5 pb-5 flex flex-col gap-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                        <form onSubmit={recordPayment} className="flex flex-wrap items-end gap-2 pt-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Payment</span>
                            <input required type="number" step="0.01" min="0.01" placeholder="0.00" value={pay.amount}
                              onChange={e => setPay(p => ({ ...p, amount: e.target.value }))}
                              className="w-28 px-3 py-2 text-sm rounded-xl outline-none" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Date</span>
                            <input type="date" value={pay.date} onChange={e => setPay(p => ({ ...p, date: e.target.value }))}
                              className="px-3 py-2 text-sm rounded-xl outline-none" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
                          </div>
                          <button type="submit" className="px-4 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110" style={{ background: 'var(--color-green)' }}>Record</button>
                          <label className="flex items-center gap-1.5 text-[11px]" style={{ color: d.borrowerEmail ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}>
                            <input type="checkbox" checked={pay.emailReceipt && !!d.borrowerEmail} disabled={!d.borrowerEmail}
                              onChange={e => setPay(p => ({ ...p, emailReceipt: e.target.checked }))} />
                            Email receipt
                          </label>
                          <button type="button" onClick={sendStatement} disabled={!d.borrowerEmail}
                            className="ml-auto px-3 py-2 text-xs font-semibold rounded-xl disabled:opacity-40 hover:bg-[var(--color-elevated)]"
                            style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>Send statement</button>
                          <button type="button" onClick={() => deleteDebt(d.id)} className="px-3 py-2 text-xs font-semibold rounded-xl hover:bg-red-500/15" style={{ color: 'var(--color-rose)' }}>Delete</button>
                        </form>

                        {detail.payments.length === 0 ? (
                          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No payments yet.</p>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {detail.payments.map(p => (
                              <div key={p.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg" style={{ background: 'var(--color-elevated)' }}>
                                <span style={{ color: 'var(--color-text-muted)' }}>{p.date}{p.note ? ` · ${p.note}` : ''}</span>
                                <span className="flex items-center gap-3">
                                  <span className="font-bold tabular-nums" style={{ color: 'var(--color-green)' }}>+${fmt(p.amount)}</span>
                                  <button onClick={() => deletePayment(p.id)} className="hover:opacity-70" style={{ color: 'var(--color-text-muted)' }}>✕</button>
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {toast && (
          <div className="fixed bottom-6 right-6 px-4 py-2.5 rounded-xl text-sm font-semibold z-50"
            style={{ background: 'var(--popover-bg)', border: '1px solid var(--color-border)', color: 'var(--color-green)' }}>{toast}</div>
        )}

        {showForm && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
            onMouseDown={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
            <form onSubmit={createDebt} className="w-full max-w-sm flex flex-col rounded-2xl" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', boxShadow: 'var(--glass-shadow)' }}>
              <div className="px-5 py-4 flex items-center justify-between rounded-t-2xl" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <p className="font-bold text-sm">New Debt</p>
                <button type="button" onClick={() => setShowForm(false)} className="w-8 h-8 rounded-lg hover:bg-[var(--color-surface)]" style={{ color: 'var(--color-text-muted)' }}>✕</button>
              </div>
              <div className="flex flex-col gap-3 px-5 py-4">
                {([['borrowerName', 'Borrower name', 'text', true], ['borrowerEmail', 'Email (optional)', 'email', false], ['principal', 'Amount lent', 'number', true], ['description', 'Note (optional)', 'text', false], ['dueDate', 'Due date (optional)', 'date', false]] as const).map(([key, label, type, req]) => (
                  <label key={key} className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                    <input required={req} type={type} step={type === 'number' ? '0.01' : undefined} min={type === 'number' ? '0.01' : undefined}
                      value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      className="px-3 py-2.5 text-sm rounded-xl outline-none" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
                  </label>
                ))}
              </div>
              <div className="flex gap-2 justify-end px-5 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium rounded-xl" style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-50" style={{ background: 'var(--color-card-violet)' }}>{saving ? 'Saving…' : 'Create'}</button>
              </div>
            </form>
          </div>,
          document.body
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + build**

Run: `npx tsc -p apps/web/tsconfig.json --noEmit && npm run build:web`
Expected: build succeeds; route list shows `/debts`.

- [ ] **Step 4: Commit**
```bash
git add apps/web/src/app/debts/page.tsx apps/web/src/components/Sidebar.tsx
git commit -m "feat(web): debts page + sidebar nav"
```

---

### Task 7: Include debts in data-reset

**Files:**
- Modify: `apps/api/src/data-reset/data-reset.service.ts`
- Modify: `apps/api/src/data-reset/data-reset.module.ts`
- Modify: `apps/web/src/components/DataResetModal.tsx`

- [ ] **Step 1: Service — add the `debts` scope.** In `data-reset.service.ts`:
  - Add imports: `import { Debt } from '../debts/debt.entity';`
  - Extend the type: `export type ResetScope = 'transactions' | 'categories' | 'projects' | 'bankAccounts' | 'budgets' | 'debts';`
  - Inject the repo in the constructor: `@InjectRepository(Debt) private debtRepo: Repository<Debt>,`
  - In `preview`, add:
    ```ts
    if (opts.scope.includes('debts')) {
      counts.debts = await this.debtRepo.count({ where: { userId } });
    }
    ```
  - In the execute method (the one that deletes — mirror the existing `projects` deletion block), add a matching block that deletes debts for the user (payments cascade):
    ```ts
    if (opts.scope.includes('debts')) {
      const found = await this.debtRepo.find({ where: { userId }, select: { id: true } });
      result.deleted.debts = found.length;
      if (found.length) await this.debtRepo.delete({ userId });
    }
    ```
    (Match the exact shape of the existing per-scope delete in this file; if it deletes by `delete({ userId })` and counts first, follow that.)

- [ ] **Step 2: Module — register the repo.** In `data-reset.module.ts`, add `Debt` to the `TypeOrmModule.forFeature([...])` array and import it (`import { Debt } from '../debts/debt.entity';`).

- [ ] **Step 3: Frontend — add the checkbox.** In `DataResetModal.tsx`, add a `debts` option wherever the scope options are listed (mirror the existing `projects` entry): label "Debts", scope key `debts`. Follow the exact pattern the file already uses for the other scopes.

- [ ] **Step 4: Build both**

Run: `npm run build:api && npm run build:web`
Expected: both succeed.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/data-reset/ apps/web/src/components/DataResetModal.tsx
git commit -m "feat: include debts in data-reset"
```

---

### Task 8: Push + manual verification on live deploy

**Files:** none (user-run; reuses existing Resend/deploy config — no new secrets)

- [ ] **Step 1: Push to deploy**
```bash
git push origin dev
```
(If the trigger doesn't fire: `gcloud builds triggers run deploy-dev --branch=dev --region=us-central1`.)

- [ ] **Step 2: Manual test on the live URL**
  1. Open **Debts** in the sidebar → **Add Debt** with a borrower name, a real email you control, and an amount.
  2. Expand it → **Record payment** with "Email receipt" checked → balance drops, a receipt email arrives from `no-reply@notify.osmioservices.com` with the remaining balance.
  3. **Send statement** → statement email arrives listing the payment.
  4. Pay the remainder → badge flips to **PAID**.
  5. Delete a payment → badge reverts to **OPEN**, balance restored.
  6. Confirm the dashboard/budget numbers are unchanged (debts are separate), and that a debt with no email disables both email buttons.

No commit (verification only).

---

## Self-Review

**Spec coverage:**
- Debt + DebtPayment entities, computed balance → Task 1, 2. ✓
- Lent-out only, no interest, status open/paid → Task 1 (model), Task 2 (recompute). ✓
- API CRUD + payments + send-statement, ownership-scoped → Task 2, 4. ✓
- Receipt (auto on payment) + statement (manual), failures don't block write → Task 2 (`try/catch`, `emailed`), Task 3 (templates). ✓
- Borrower external email-only, email optional → entity nullable `borrowerEmail`; UI disables email actions when absent (Task 6). ✓
- Web page + summary cards + add/record/statement/delete + sidebar nav → Task 6. ✓
- Separate from budget (no transaction/budget coupling) → no such code added; verified in Task 8 step 2.6. ✓
- Register entities in db config + app.module + data-reset → Task 1, 4, 7. ✓
- Reuses Resend, no new deploy secrets → Task 8 note. ✓

**Placeholder scan:** Task 7 references "mirror the existing pattern" for the data-reset execute block and the modal checkbox because that file's exact delete/UI idiom isn't quoted here — the implementer must open `data-reset.service.ts`/`DataResetModal.tsx` and match the established per-scope shape. This is intentional (follow existing code) rather than an invented API; the scope key (`debts`), repo, and count/delete calls are all specified.

**Type consistency:** `DebtWithBalance` (`paid`/`remaining`/`percentage`), `CreateDebtDto`, `PaymentDto` defined in Task 2 and consumed in Task 4. `sendDebtReceipt(to, borrowerName, {lenderName, amountPaid, remaining})` and `sendDebtStatement(to, borrowerName, {lenderName, principal, paid, remaining, payments})` defined in Task 3 and called with matching shapes in Task 2. `addPayment` returns `{ debt, emailed }` — consumed by the web `recordPayment` (`data.emailed`) in Task 6. Endpoint paths (`/debts`, `/debts/:id/payments`, `/debts/:id/send-statement`) match between Task 4 and Task 6.
