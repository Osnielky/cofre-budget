# Gmail Receipt Lookup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users connect their Gmail account (read-only) so they can browse merchant receipt emails inside Cofre, see itemized breakdowns, and create categorized transactions from them.

**Architecture:** A `gmail/` NestJS module handles OAuth connect/disconnect and Gmail API calls + AI parsing; a `receipts/` module caches parsed receipts and handles transaction creation. The Settings page gains a "Integrations" tab for connect/disconnect. A new `/receipts` page lists receipts and allows per-item category assignment.

**Tech Stack:** `googleapis` (Gmail API + OAuth2), `@anthropic-ai/sdk` (receipt parsing via claude-haiku-4-5-20251001), Node.js `crypto` (AES-256-CBC token encryption), existing `passport-google-oauth20`, `@nestjs/jwt` for state signing.

## Global Constraints

- NestJS 11, Next.js 16, TypeORM with `synchronize: true` (entities auto-migrate — no SQL files needed)
- All new entities must be added to the `entities` array in `apps/api/src/config/database.config.ts`
- NestJS CommonJS interop: use `import X = require('X')` for CJS-only packages where needed
- `apps/api/.swcrc` requires `keepClassNames: true` and `decoratorMetadata: true` (already set)
- All API routes are prefixed `/api` (set in `main.ts`)
- JWT cookie name is `access_token`; use `JwtAuthGuard` on all protected routes
- No test runner configured — verification is via `curl` commands
- Do not push to git remote; commit locally only
- Glassmorphism UI: surfaces use `rgba(35,35,47,0.5)` + `backdrop-filter: blur()`, never solid backgrounds

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json` (root)

**Interfaces:**
- Produces: `googleapis` and `@anthropic-ai/sdk` available as Node modules

- [ ] **Step 1: Install the two new packages**

```bash
cd /Users/osnielky/Desktop/cofre-budget
npm install googleapis @anthropic-ai/sdk
```

Expected: `added N packages` with no peer-dep errors.

- [ ] **Step 2: Verify both packages resolve**

```bash
node -e "require('googleapis'); require('@anthropic-ai/sdk'); console.log('ok')"
```

Expected output: `ok`

- [ ] **Step 3: Add ANTHROPIC_API_KEY to the env variable list in CLAUDE.md**

Open `CLAUDE.md` and add `ANTHROPIC_API_KEY` to the Required variables block alongside `JWT_SECRET`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json CLAUDE.md
git commit -m "chore: install googleapis and anthropic sdk for gmail receipt feature"
```

---

### Task 2: ConnectedApp entity + database registration

**Files:**
- Create: `apps/api/src/connected-apps/connected-app.entity.ts`
- Modify: `apps/api/src/config/database.config.ts`

**Interfaces:**
- Produces: `ConnectedApp` TypeORM entity with columns: `id`, `userId`, `provider`, `email`, `accessToken`, `refreshToken`, `tokenExpiry`, `createdAt`

- [ ] **Step 1: Create the entity file**

Create `apps/api/src/connected-apps/connected-app.entity.ts`:

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('connected_apps')
export class ConnectedApp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  provider: string;

  @Column({ nullable: true })
  email: string;

  @Column({ type: 'text', nullable: true })
  accessToken: string;

  @Column({ type: 'text', nullable: true })
  refreshToken: string;

  @Column({ type: 'bigint', nullable: true })
  tokenExpiry: number;

  @CreateDateColumn()
  createdAt: Date;
}
```

- [ ] **Step 2: Register the entity in database.config.ts**

Open `apps/api/src/config/database.config.ts`. Add the import at the top alongside the other entity imports:

```typescript
import { ConnectedApp } from '../connected-apps/connected-app.entity';
```

Then add `ConnectedApp` to the `entities` array:

```typescript
entities: [User, BankAccount, PlaidItem, Transaction, Category, Budget, Project, ProjectCategory, Debt, DebtPayment, ConnectedApp],
```

- [ ] **Step 3: Verify table is created**

Start the API and check the DB:

```bash
npm run dev:api &
sleep 8
psql -U postgres cofre_budget -c "\d connected_apps"
```

Expected: table columns matching the entity definition. Kill the dev server after verifying.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/connected-apps/connected-app.entity.ts apps/api/src/config/database.config.ts
git commit -m "feat(gmail): add connected_apps entity"
```

---

### Task 3: Gmail OAuth module (connect / callback / disconnect / status)

**Files:**
- Create: `apps/api/src/gmail/gmail.service.ts`
- Create: `apps/api/src/gmail/gmail.controller.ts`
- Create: `apps/api/src/gmail/gmail.module.ts`
- Modify: `apps/api/src/app/app.module.ts`

**Interfaces:**
- Consumes: `ConnectedApp` entity from Task 2
- Produces:
  - `GET /api/gmail/connect` → redirects to Google OAuth (requires JWT cookie)
  - `GET /api/gmail/callback?code=&state=` → stores tokens, redirects to `/settings`
  - `DELETE /api/gmail/disconnect` → removes connection (requires JWT cookie)
  - `GET /api/gmail/status` → `{ connected: boolean; email?: string; connectedAt?: string }` (requires JWT cookie)
  - `GmailService.getConnection(userId): Promise<ConnectedApp | null>`
  - `GmailService.getAuthorizedClient(userId): Promise<OAuth2Client>` — returns a googleapis OAuth2Client with refreshed credentials

- [ ] **Step 1: Create GmailService**

Create `apps/api/src/gmail/gmail.service.ts`:

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { google } from 'googleapis';
import * as crypto from 'crypto';
import { ConnectedApp } from '../connected-apps/connected-app.entity';

@Injectable()
export class GmailService {
  private readonly encKey: Buffer;

  constructor(
    private config: ConfigService,
    private jwtService: JwtService,
    @InjectRepository(ConnectedApp) private repo: Repository<ConnectedApp>,
  ) {
    const secret = this.config.get<string>('JWT_SECRET') ?? 'fallback-secret-32-chars-minimum!!';
    this.encKey = crypto.createHash('sha256').update(secret).digest();
  }

  private makeOAuth2Client() {
    return new google.auth.OAuth2(
      this.config.get<string>('GOOGLE_CLIENT_ID'),
      this.config.get<string>('GOOGLE_CLIENT_SECRET'),
      this.config.get<string>('GOOGLE_GMAIL_REDIRECT_URI', 'http://localhost:3333/api/gmail/callback'),
    );
  }

  buildAuthUrl(userId: string): string {
    const state = this.jwtService.sign({ userId }, { expiresIn: '5m' });
    const client = this.makeOAuth2Client();
    return client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/userinfo.email'],
      prompt: 'consent',
      state,
    });
  }

  async handleCallback(code: string, state: string): Promise<void> {
    let userId: string;
    try {
      const payload = this.jwtService.verify(state) as { userId: string };
      userId = payload.userId;
    } catch {
      throw new UnauthorizedException('Invalid or expired OAuth state');
    }

    const client = this.makeOAuth2Client();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data } = await oauth2.userinfo.get();
    const email = data.email ?? '';

    const existing = await this.repo.findOneBy({ userId, provider: 'gmail' });
    const record = existing ?? this.repo.create({ userId, provider: 'gmail' });
    record.email = email;
    record.accessToken = this.encrypt(tokens.access_token ?? '');
    record.refreshToken = this.encrypt(tokens.refresh_token ?? record.refreshToken ?? '');
    record.tokenExpiry = tokens.expiry_date ?? null;
    await this.repo.save(record);
  }

  async getConnection(userId: string): Promise<ConnectedApp | null> {
    return this.repo.findOneBy({ userId, provider: 'gmail' });
  }

  async disconnect(userId: string): Promise<void> {
    await this.repo.delete({ userId, provider: 'gmail' });
  }

  async getAuthorizedClient(userId: string) {
    const conn = await this.getConnection(userId);
    if (!conn) throw new UnauthorizedException('Gmail not connected');
    const client = this.makeOAuth2Client();
    client.setCredentials({
      access_token: this.decrypt(conn.accessToken),
      refresh_token: this.decrypt(conn.refreshToken),
      expiry_date: conn.tokenExpiry ? Number(conn.tokenExpiry) : undefined,
    });
    // Auto-refresh if expired
    const { credentials } = await client.refreshAccessToken();
    client.setCredentials(credentials);
    if (credentials.access_token && credentials.access_token !== this.decrypt(conn.accessToken)) {
      conn.accessToken = this.encrypt(credentials.access_token);
      conn.tokenExpiry = credentials.expiry_date ?? conn.tokenExpiry;
      await this.repo.save(conn);
    }
    return client;
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encKey, iv);
    return iv.toString('hex') + ':' + Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]).toString('hex');
  }

  private decrypt(text: string): string {
    const [ivHex, dataHex] = text.split(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encKey, Buffer.from(ivHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  }
}
```

- [ ] **Step 2: Create GmailController**

Create `apps/api/src/gmail/gmail.controller.ts`:

```typescript
import { Controller, Get, Delete, Query, Request, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GmailService } from './gmail.service';

const FRONTEND = process.env.FRONTEND_URL ?? 'http://localhost:3000';

@Controller('gmail')
export class GmailController {
  constructor(private gmail: GmailService) {}

  @UseGuards(JwtAuthGuard)
  @Get('connect')
  connect(@Request() req: any, @Res() res: Response) {
    const url = this.gmail.buildAuthUrl(req.user.id);
    return res.redirect(url);
  }

  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      await this.gmail.handleCallback(code, state);
      return res.redirect(`${FRONTEND}/settings?tab=integrations&status=connected`);
    } catch {
      return res.redirect(`${FRONTEND}/settings?tab=integrations&status=error`);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Delete('disconnect')
  async disconnect(@Request() req: any) {
    await this.gmail.disconnect(req.user.id);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('status')
  async status(@Request() req: any) {
    const conn = await this.gmail.getConnection(req.user.id);
    if (!conn) return { connected: false };
    return { connected: true, email: conn.email, connectedAt: conn.createdAt };
  }
}
```

- [ ] **Step 3: Create GmailModule**

Create `apps/api/src/gmail/gmail.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ConnectedApp } from '../connected-apps/connected-app.entity';
import { GmailService } from './gmail.service';
import { GmailController } from './gmail.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConnectedApp]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [GmailController],
  providers: [GmailService],
  exports: [GmailService],
})
export class GmailModule {}
```

- [ ] **Step 4: Register GmailModule in AppModule**

Open `apps/api/src/app/app.module.ts`. Add the import:

```typescript
import { GmailModule } from '../gmail/gmail.module';
```

Add `GmailModule` to the `imports` array alongside the other modules.

- [ ] **Step 5: Add env variable to .env**

Add to the root `.env` file:

```
GOOGLE_GMAIL_REDIRECT_URI=http://localhost:3333/api/gmail/callback
ANTHROPIC_API_KEY=your-anthropic-api-key-here
```

- [ ] **Step 6: Verify OAuth status endpoint works**

```bash
npm run build:api && node dist/apps/api/main.js &
sleep 5
# First log in to get a cookie, then:
curl -s http://localhost:3333/api/gmail/status \
  -H "Cookie: access_token=YOUR_JWT_TOKEN"
```

Expected: `{"connected":false}`

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/gmail/ apps/api/src/app/app.module.ts .env
git commit -m "feat(gmail): add OAuth connect/disconnect/status endpoints"
```

---

### Task 4: Gmail email fetch + AI receipt parsing

**Files:**
- Modify: `apps/api/src/gmail/gmail.service.ts`

**Interfaces:**
- Consumes: `GmailService.getAuthorizedClient(userId)` from Task 3
- Produces:
  - `GmailService.fetchAndParseReceipts(userId): Promise<RawReceipt[]>`
  - Type `RawReceipt`: `{ gmailMessageId, subject, merchant, orderNumber, orderDate, total, currency, items: { name, quantity, unitPrice, total }[] }`

- [ ] **Step 1: Add MERCHANT_QUERY constant and fetchAndParseReceipts method to GmailService**

Open `apps/api/src/gmail/gmail.service.ts`. Add the Anthropic import at the top:

```typescript
import Anthropic from '@anthropic-ai/sdk';
```

Add a private `anthropic` field and initialize it in the constructor, after the `encKey` line:

```typescript
private readonly anthropic: Anthropic;
```

At the end of the constructor body:

```typescript
const anthropicKey = this.config.get<string>('ANTHROPIC_API_KEY');
this.anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : new Anthropic();
```

Add these methods at the end of the class (before the closing `}`):

```typescript
async fetchAndParseReceipts(userId: string): Promise<RawReceipt[]> {
  const client = await this.getAuthorizedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth: client });

  const QUERY =
    'from:(ship-confirm@amazon.com OR auto-confirm@amazon.com OR doordash.com OR ubereats.com OR order@walmart.com OR no-reply@apple.com OR noreply@doordash.com) newer_than:90d';

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: QUERY,
    maxResults: 50,
  });

  const messages = listRes.data.messages ?? [];
  const results: RawReceipt[] = [];

  for (const msg of messages) {
    if (!msg.id) continue;
    const full = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
    const subject = this.extractHeader(full.data.payload?.headers ?? [], 'Subject');
    const body = this.extractBody(full.data.payload);
    if (!body) continue;
    const parsed = await this.parseWithClaude(body, subject);
    if (parsed) {
      results.push({ gmailMessageId: msg.id, subject, ...parsed });
    }
  }

  return results;
}

private extractHeader(headers: any[], name: string): string {
  return headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

private extractBody(payload: any): string {
  if (!payload) return '';
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf8');
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = this.extractBody(part);
      if (text) return text;
    }
  }
  return '';
}

private async parseWithClaude(emailHtml: string, subject: string): Promise<Omit<RawReceipt, 'gmailMessageId' | 'subject'> | null> {
  const truncated = emailHtml.slice(0, 8000);
  const prompt = `You are a receipt parser. Extract purchase data from this merchant receipt email and return ONLY valid JSON (no markdown, no explanation).

Email subject: ${subject}

Email body (HTML):
${truncated}

Return this exact JSON shape:
{
  "merchant": "string (merchant name, e.g. Amazon)",
  "orderNumber": "string or null",
  "orderDate": "YYYY-MM-DD or null",
  "currency": "USD",
  "total": number,
  "items": [
    { "name": "string", "quantity": number, "unitPrice": number, "total": number }
  ]
}

If you cannot find a clear order total or any items, return null.`;

  try {
    const response = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    if (text === 'null' || !text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Add the RawReceipt type export at the top of the file**

At the top of `apps/api/src/gmail/gmail.service.ts`, after the imports, add:

```typescript
export interface RawReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface RawReceipt {
  gmailMessageId: string;
  subject: string;
  merchant: string;
  orderNumber: string | null;
  orderDate: string | null;
  currency: string;
  total: number;
  items: RawReceiptItem[];
}
```

- [ ] **Step 3: Build and spot-check**

```bash
npm run build:api 2>&1 | tail -20
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/gmail/gmail.service.ts
git commit -m "feat(gmail): add email fetch and AI receipt parsing"
```

---

### Task 5: Receipt entity + receiptId on Transaction

**Files:**
- Create: `apps/api/src/receipts/receipt.entity.ts`
- Modify: `apps/api/src/transactions/transaction.entity.ts`
- Modify: `apps/api/src/config/database.config.ts`

**Interfaces:**
- Produces: `Receipt` TypeORM entity; `Transaction.receiptId` nullable FK column

- [ ] **Step 1: Create the Receipt entity**

Create `apps/api/src/receipts/receipt.entity.ts`:

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('receipts')
export class Receipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ unique: true })
  gmailMessageId: string;

  @Column()
  merchant: string;

  @Column({ nullable: true })
  orderNumber: string;

  @Column({ type: 'date', nullable: true })
  orderDate: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total: number;

  @Column({ default: 'USD' })
  currency: string;

  @Column({ type: 'jsonb' })
  items: { name: string; quantity: number; unitPrice: number; total: number }[];

  @Column({ nullable: true })
  rawSubject: string;

  @Column({ default: false })
  imported: boolean;

  @CreateDateColumn()
  parsedAt: Date;
}
```

- [ ] **Step 2: Add receiptId to Transaction entity**

Open `apps/api/src/transactions/transaction.entity.ts`. At the end of the class (before the closing `}`), after the `note` column, add:

```typescript
  @Column({ type: 'uuid', nullable: true, default: null })
  receiptId: string | null;
```

- [ ] **Step 3: Register Receipt in database.config.ts**

Open `apps/api/src/config/database.config.ts`. Add import:

```typescript
import { Receipt } from '../receipts/receipt.entity';
```

Add `Receipt` to the `entities` array:

```typescript
entities: [User, BankAccount, PlaidItem, Transaction, Category, Budget, Project, ProjectCategory, Debt, DebtPayment, ConnectedApp, Receipt],
```

- [ ] **Step 4: Verify tables**

```bash
npm run build:api && node dist/apps/api/main.js &
sleep 5
psql -U postgres cofre_budget -c "\d receipts" && psql -U postgres cofre_budget -c "\d transactions" | grep receipt
```

Expected: `receipts` table with all columns; `transactions` table shows `receipt_id` column.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/receipts/receipt.entity.ts apps/api/src/transactions/transaction.entity.ts apps/api/src/config/database.config.ts
git commit -m "feat(receipts): add receipt entity and receiptId to transactions"
```

---

### Task 6: ReceiptsService + ReceiptsController + ReceiptsModule

**Files:**
- Create: `apps/api/src/receipts/receipts.service.ts`
- Create: `apps/api/src/receipts/receipts.controller.ts`
- Create: `apps/api/src/receipts/receipts.module.ts`
- Modify: `apps/api/src/app/app.module.ts`

**Interfaces:**
- Consumes: `GmailService.fetchAndParseReceipts(userId)` from Task 4; `Receipt` entity from Task 5; `Transaction` entity + `createManual` pattern from existing code
- Produces:
  - `GET /api/receipts` → `Receipt[]` (syncs new ones from Gmail, returns all cached)
  - `POST /api/receipts/:id/import` body: `{ splits: { itemIndices: number[]; categoryId: string | null; bankAccountId?: string | null }[] }` → `Transaction[]`

- [ ] **Step 1: Create ReceiptsService**

Create `apps/api/src/receipts/receipts.service.ts`:

```typescript
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Receipt } from './receipt.entity';
import { Transaction } from '../transactions/transaction.entity';
import { GmailService } from '../gmail/gmail.service';

export interface ImportSplit {
  itemIndices: number[];
  categoryId: string | null;
  bankAccountId?: string | null;
}

@Injectable()
export class ReceiptsService {
  constructor(
    @InjectRepository(Receipt) private receiptRepo: Repository<Receipt>,
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    private gmail: GmailService,
  ) {}

  async findByUser(userId: string): Promise<Receipt[]> {
    return this.receiptRepo.find({
      where: { userId },
      order: { parsedAt: 'DESC' },
    });
  }

  async syncAndFind(userId: string): Promise<Receipt[]> {
    const existing = await this.receiptRepo.find({ where: { userId } });
    const existingIds = new Set(existing.map((r) => r.gmailMessageId));

    let raw: Awaited<ReturnType<GmailService['fetchAndParseReceipts']>> = [];
    try {
      raw = await this.gmail.fetchAndParseReceipts(userId);
    } catch {
      // Gmail not connected or fetch failed — return cached only
      return existing;
    }

    const newReceipts = raw.filter((r) => !existingIds.has(r.gmailMessageId));
    for (const r of newReceipts) {
      await this.receiptRepo.save(
        this.receiptRepo.create({
          userId,
          gmailMessageId: r.gmailMessageId,
          merchant: r.merchant,
          orderNumber: r.orderNumber ?? undefined,
          orderDate: r.orderDate ?? undefined,
          total: r.total,
          currency: r.currency,
          items: r.items,
          rawSubject: r.subject,
          imported: false,
        }),
      );
    }

    return this.receiptRepo.find({ where: { userId }, order: { parsedAt: 'DESC' } });
  }

  async importToTransactions(receiptId: string, userId: string, splits: ImportSplit[]): Promise<Transaction[]> {
    const receipt = await this.receiptRepo.findOneBy({ id: receiptId });
    if (!receipt) throw new NotFoundException('Receipt not found');
    if (receipt.userId !== userId) throw new ForbiddenException();

    const created: Transaction[] = [];

    for (const split of splits) {
      const splitTotal = split.itemIndices.reduce((sum, idx) => {
        const item = receipt.items[idx];
        return sum + (item?.total ?? 0);
      }, 0);

      if (splitTotal === 0) continue;

      const itemNames = split.itemIndices
        .map((idx) => receipt.items[idx]?.name)
        .filter(Boolean)
        .join(', ');

      const tx = await this.txRepo.save(
        this.txRepo.create({
          userId,
          source: 'manual',
          amount: -Math.abs(splitTotal),
          name: `${receipt.merchant}${itemNames ? ` — ${itemNames.slice(0, 100)}` : ''}`,
          date: receipt.orderDate ?? new Date().toISOString().slice(0, 10),
          pending: false,
          categoryId: split.categoryId ?? undefined,
          bankAccountId: split.bankAccountId ?? undefined,
          receiptId,
        }),
      );
      created.push(tx);
    }

    if (created.length > 0) {
      receipt.imported = true;
      await this.receiptRepo.save(receipt);
    }

    return created;
  }
}
```

- [ ] **Step 2: Create ReceiptsController**

Create `apps/api/src/receipts/receipts.controller.ts`:

```typescript
import { Controller, Get, Post, Param, Body, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReceiptsService, ImportSplit } from './receipts.service';

@UseGuards(JwtAuthGuard)
@Controller('receipts')
export class ReceiptsController {
  constructor(private service: ReceiptsService) {}

  @Get()
  list(@Request() req: any) {
    return this.service.syncAndFind(req.user.id);
  }

  @Post(':id/import')
  import(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { splits: ImportSplit[] },
  ) {
    return this.service.importToTransactions(id, req.user.id, body.splits);
  }
}
```

- [ ] **Step 3: Create ReceiptsModule**

Create `apps/api/src/receipts/receipts.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Receipt } from './receipt.entity';
import { Transaction } from '../transactions/transaction.entity';
import { ReceiptsService } from './receipts.service';
import { ReceiptsController } from './receipts.controller';
import { GmailModule } from '../gmail/gmail.module';

@Module({
  imports: [TypeOrmModule.forFeature([Receipt, Transaction]), GmailModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService],
})
export class ReceiptsModule {}
```

- [ ] **Step 4: Register ReceiptsModule in AppModule**

Open `apps/api/src/app/app.module.ts`. Add:

```typescript
import { ReceiptsModule } from '../receipts/receipts.module';
```

Add `ReceiptsModule` to the `imports` array.

- [ ] **Step 5: Build and verify endpoints exist**

```bash
npm run build:api && node dist/apps/api/main.js &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3333/api/receipts
```

Expected: `401` (not authenticated — endpoint exists and guard is active).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/receipts/ apps/api/src/app/app.module.ts
git commit -m "feat(receipts): add receipts service, controller, and module"
```

---

### Task 7: Settings UI — Connected Apps tab

**Files:**
- Modify: `apps/web/src/app/settings/page.tsx`

**Interfaces:**
- Consumes: `GET /api/gmail/status`, `GET /api/gmail/connect` (redirect), `DELETE /api/gmail/disconnect`
- Produces: "Integrations" tab in Settings that shows Gmail connection state + connect/disconnect button; reads `?tab=integrations` query param on load to auto-activate the tab

- [ ] **Step 1: Add 'integrations' to the Tab type**

Open `apps/web/src/app/settings/page.tsx`. Find line 21:

```typescript
type Tab = 'account' | 'banks' | 'categories' | 'projects' | 'appearance' | 'data';
```

Replace with:

```typescript
type Tab = 'account' | 'banks' | 'categories' | 'projects' | 'appearance' | 'integrations' | 'data';
```

- [ ] **Step 2: Add the Integrations tab to the TABS array**

Find the `TABS` array (around line 119). Add a new entry before the `appearance` tab entry. First locate the appearance entry by its icon JSX, and insert before it:

```typescript
    {
      id: 'integrations',
      label: 'Integrations',
      icon: (
        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      ),
    },
```

- [ ] **Step 3: Add Gmail status state and fetch logic**

Find the existing `useState` declarations near the top of the component (around line 178). Add after the `activeTab` state:

```typescript
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; email?: string; connectedAt?: string } | null>(null);
  const [gmailLoading, setGmailLoading] = useState(false);
```

Add a `useEffect` to read the `?tab=` and `?status=` query params on mount, and to fetch Gmail status when the integrations tab is active. Find the first `useEffect` in the component and add after it:

```typescript
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') as Tab | null;
    if (tab && ['account', 'banks', 'categories', 'projects', 'appearance', 'integrations'].includes(tab)) {
      setActiveTab(tab);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'integrations') return;
    setGmailLoading(true);
    fetch(`${API}/gmail/status`, { credentials: 'include' })
      .then((r) => r.json())
      .then(setGmailStatus)
      .catch(() => setGmailStatus({ connected: false }))
      .finally(() => setGmailLoading(false));
  }, [activeTab]);
```

- [ ] **Step 4: Add disconnect handler**

Find the area where other handler functions are defined (e.g., around where `handlePlaidSuccess` or similar functions are). Add:

```typescript
  async function handleGmailDisconnect() {
    if (!confirm('Disconnect Gmail? Cached receipts will remain.')) return;
    await fetch(`${API}/gmail/disconnect`, { method: 'DELETE', credentials: 'include' });
    setGmailStatus({ connected: false });
  }
```

- [ ] **Step 5: Add the Integrations tab panel**

Find the last `{activeTab === 'appearance' && (` block and just before it add:

```typescript
          {activeTab === 'integrations' && (
            <div style={{ maxWidth: 520 }}>
              <p className="text-sm mb-6" style={{ color: 'rgba(174,180,194,0.8)' }}>
                Connect external services so Cofre can pull in additional information.
              </p>
              {/* Gmail card */}
              <div className="rounded-2xl p-5 flex items-center justify-between gap-4"
                style={{ background: 'rgba(35,35,47,0.5)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    ✉️
                  </div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: '#F2F1EA' }}>Gmail</p>
                    {gmailLoading
                      ? <p className="text-xs mt-0.5" style={{ color: '#6b7488' }}>Checking…</p>
                      : gmailStatus?.connected
                        ? <p className="text-xs mt-0.5" style={{ color: '#4FBF7F' }}>{gmailStatus.email}</p>
                        : <p className="text-xs mt-0.5" style={{ color: '#6b7488' }}>Not connected</p>
                    }
                  </div>
                </div>
                {gmailStatus?.connected
                  ? (
                    <button onClick={handleGmailDisconnect}
                      className="text-xs px-3 py-1.5 rounded-xl font-medium transition-opacity hover:opacity-70"
                      style={{ background: 'rgba(255,80,80,0.12)', color: '#F07A7A', border: '1px solid rgba(255,80,80,0.2)' }}>
                      Disconnect
                    </button>
                  ) : (
                    <a href={`${API}/gmail/connect`}
                      className="text-xs px-3 py-1.5 rounded-xl font-medium transition-opacity hover:opacity-70"
                      style={{ background: 'rgba(155,109,255,0.15)', color: '#9B6DFF', border: '1px solid rgba(155,109,255,0.25)', textDecoration: 'none' }}>
                      Connect
                    </a>
                  )
                }
              </div>
            </div>
          )}
```

- [ ] **Step 6: Verify in browser**

```bash
npm run dev:web
```

Open `http://localhost:3000/settings`. Confirm the "Integrations" tab appears in the tab bar and clicking it shows the Gmail card with a "Connect" button.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/settings/page.tsx
git commit -m "feat(settings): add Connected Apps / Integrations tab with Gmail connect UI"
```

---

### Task 8: Receipts web page

**Files:**
- Create: `apps/web/src/app/receipts/page.tsx`

**Interfaces:**
- Consumes: `GET /api/receipts` → `Receipt[]`, `POST /api/receipts/:id/import` body `{ splits: ImportSplit[] }` → `Transaction[]`
- Consumes: `GET /api/categories` (existing endpoint) → `Category[]` for the category dropdowns

- [ ] **Step 1: Create the receipts page**

Create `apps/web/src/app/receipts/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface ReceiptItem { name: string; quantity: number; unitPrice: number; total: number }
interface Receipt {
  id: string; merchant: string; orderNumber: string | null; orderDate: string | null;
  total: number; currency: string; items: ReceiptItem[]; rawSubject: string; imported: boolean; parsedAt: string;
}
interface Category { id: string; name: string; icon: string; color: string; type: string }

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Receipt | null>(null);
  const [itemCategories, setItemCategories] = useState<Record<number, string>>({});
  const [itemAccounts, setItemAccounts] = useState<Record<number, string>>({});
  const [importing, setImporting] = useState(false);
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`${API}/gmail/status`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setGmailConnected(d.connected))
      .catch(() => setGmailConnected(false));

    fetch(`${API}/categories`, { credentials: 'include' })
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {});

    fetch(`${API}/receipts`, { credentials: 'include' })
      .then((r) => r.json())
      .then(setReceipts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function openReceipt(r: Receipt) {
    setSelected(r);
    setItemCategories({});
    setItemAccounts({});
  }

  function closeReceipt() { setSelected(null); }

  function setCategory(idx: number, categoryId: string) {
    setItemCategories((prev) => ({ ...prev, [idx]: categoryId }));
  }

  function countGroups(): number {
    return new Set(Object.values(itemCategories)).size || 1;
  }

  async function handleImport() {
    if (!selected) return;
    setImporting(true);

    // Group item indices by categoryId
    const groups: Record<string, number[]> = {};
    selected.items.forEach((_, idx) => {
      const catId = itemCategories[idx] ?? '__uncategorized__';
      if (!groups[catId]) groups[catId] = [];
      groups[catId].push(idx);
    });

    const splits = Object.entries(groups).map(([catId, indices]) => ({
      itemIndices: indices,
      categoryId: catId === '__uncategorized__' ? null : catId,
      bankAccountId: itemAccounts[indices[0]] ?? null,
    }));

    try {
      const res = await fetch(`${API}/receipts/${selected.id}/import`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ splits }),
      });
      if (res.ok) {
        setReceipts((prev) => prev.map((r) => r.id === selected.id ? { ...r, imported: true } : r));
        setSelected(null);
      }
    } finally {
      setImporting(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    background: 'rgba(35,35,47,0.5)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.08)',
  };

  const expenseCategories = categories.filter((c) => c.type === 'expense');

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 p-6 md:p-8" style={{ minWidth: 0 }}>
        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: '#F2F1EA' }}>Receipts</h1>
          <p className="text-sm mt-1" style={{ color: '#6b7488' }}>Browse merchant receipts from your Gmail and create transactions.</p>
        </div>

        {gmailConnected === false && (
          <div className="rounded-2xl p-6 mb-6 text-center" style={cardStyle}>
            <p className="text-sm mb-3" style={{ color: '#aeb4c2' }}>Connect your Gmail to find receipts automatically.</p>
            <a href="/settings?tab=integrations"
              className="inline-block text-sm px-4 py-2 rounded-xl font-medium"
              style={{ background: 'rgba(155,109,255,0.15)', color: '#9B6DFF', border: '1px solid rgba(155,109,255,0.25)', textDecoration: 'none' }}>
              Connect Gmail →
            </a>
          </div>
        )}

        {loading && (
          <p className="text-sm" style={{ color: '#6b7488' }}>Loading receipts…</p>
        )}

        {!loading && receipts.length === 0 && gmailConnected && (
          <div className="rounded-2xl p-8 text-center" style={cardStyle}>
            <p className="text-sm" style={{ color: '#aeb4c2' }}>No receipt emails found in the last 90 days.</p>
          </div>
        )}

        <div className="grid gap-3">
          {receipts.map((r) => (
            <button key={r.id} onClick={() => openReceipt(r)}
              className="w-full text-left rounded-2xl p-4 transition-opacity hover:opacity-80"
              style={cardStyle}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm" style={{ color: '#F2F1EA' }}>{r.merchant}</p>
                  {r.orderNumber && <p className="text-xs mt-0.5" style={{ color: '#6b7488' }}>Order {r.orderNumber}</p>}
                  {r.orderDate && <p className="text-xs mt-0.5" style={{ color: '#6b7488' }}>{r.orderDate}</p>}
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm" style={{ color: '#F2F1EA' }}>
                    ${Number(r.total).toFixed(2)}
                  </p>
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={r.imported
                      ? { background: 'rgba(79,191,127,0.12)', color: '#4FBF7F' }
                      : { background: 'rgba(245,200,66,0.12)', color: '#F5C842' }}>
                    {r.imported ? 'Imported' : 'Pending'}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Receipt detail drawer */}
        {selected && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={closeReceipt}>
            <div className="w-full max-w-lg rounded-2xl p-6 max-h-[85vh] overflow-y-auto"
              style={{ background: 'rgba(20,28,50,0.98)', border: '1px solid rgba(255,255,255,0.1)' }}
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-lg" style={{ color: '#F2F1EA' }}>{selected.merchant}</h2>
                  {selected.orderNumber && <p className="text-xs" style={{ color: '#6b7488' }}>Order {selected.orderNumber}</p>}
                </div>
                <button onClick={closeReceipt} style={{ color: '#6b7488' }}>✕</button>
              </div>

              <p className="text-xs mb-4" style={{ color: '#aeb4c2' }}>
                Assign a category to each item. Items with the same category become one transaction.
              </p>

              <div className="space-y-2 mb-6">
                {selected.items.map((item, idx) => (
                  <div key={idx} className="rounded-xl p-3 flex items-center gap-3"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: '#E8E6DF' }}>{item.name}</p>
                      <p className="text-xs" style={{ color: '#6b7488' }}>
                        {item.quantity > 1 ? `${item.quantity}× ` : ''}${item.unitPrice.toFixed(2)} = ${item.total.toFixed(2)}
                      </p>
                    </div>
                    <select
                      value={itemCategories[idx] ?? ''}
                      onChange={(e) => setCategory(idx, e.target.value)}
                      className="text-xs rounded-lg px-2 py-1.5 outline-none"
                      style={{ background: 'rgba(255,255,255,0.06)', color: '#E8E6DF', border: '1px solid rgba(255,255,255,0.1)', minWidth: 120 }}>
                      <option value="">No category</option>
                      {expenseCategories.map((c) => (
                        <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="rounded-xl p-3 mb-4" style={{ background: 'rgba(155,109,255,0.08)', border: '1px solid rgba(155,109,255,0.15)' }}>
                <p className="text-xs" style={{ color: '#9B6DFF' }}>
                  This will create <strong>{countGroups()}</strong> transaction{countGroups() !== 1 ? 's' : ''} totaling <strong>${Number(selected.total).toFixed(2)}</strong>.
                </p>
              </div>

              <button onClick={handleImport} disabled={importing}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ background: 'linear-gradient(180deg,#9B6DFF,#7B4DDF)', color: '#fff' }}>
                {importing ? 'Creating…' : `Create ${countGroups()} Transaction${countGroups() !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add Receipts link to Sidebar**

Open `apps/web/src/components/Sidebar.tsx` (find the file — it likely exports a sidebar with nav links). Add a receipts link alongside the other nav items. The exact JSX will match the existing pattern. Find a nav item like the transactions link and duplicate its structure:

```tsx
{ href: '/receipts', label: 'Receipts', icon: <svg ...envelope icon...> }
```

Use this SVG for the icon:
```tsx
<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
</svg>
```

- [ ] **Step 3: Verify in browser**

```bash
npm run dev:web
```

Open `http://localhost:3000/receipts`. Confirm:
- Page loads without errors
- If Gmail is not connected, the "Connect Gmail →" CTA appears
- If Gmail is connected, receipts load (or "No receipt emails found" if inbox has none)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/receipts/ apps/web/src/components/Sidebar.tsx
git commit -m "feat(receipts): add receipts page with item categorization and transaction creation"
```

---

## Self-Review Checklist (pre-execution)

**Spec coverage:**
- [x] Gmail OAuth connect/disconnect → Tasks 3, 7
- [x] Connected Apps section in Settings → Task 7
- [x] Receipts screen with receipt list → Task 8
- [x] Itemized breakdown per receipt → Task 8
- [x] Category assignment per item → Task 8
- [x] Multiple transactions per category split → Task 6 (`importToTransactions`)
- [x] Receipt is informational — no auto-creation → confirmed in Task 6 (user triggers import)
- [x] 90-day lookback window → Task 4 (`newer_than:90d` in query)
- [x] Imported badge / status → Tasks 5, 8
- [x] `connected_apps` table → Task 2
- [x] `receipts` table → Task 5
- [x] `receiptId` on transactions → Task 5
- [x] Token encryption → Task 3 (AES-256-CBC)
- [x] Fallback when parsing fails → Task 4 (catch returns null)
- [x] Fallback when Gmail not connected → Task 6 (returns cached)

**No placeholders found.**

**Type consistency:** `RawReceipt` and `RawReceiptItem` defined in Task 4 and consumed correctly in Task 6 `ReceiptsService.syncAndFind`. `ImportSplit` exported from `receipts.service.ts` and imported in `receipts.controller.ts`. `Receipt` entity fields match what the frontend reads in Task 8.
