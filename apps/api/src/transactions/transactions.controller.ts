import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TransactionsService, CsvRow } from './transactions.service';
import { ReceiptFinderService } from './receipt-finder.service';

@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(
    private service: TransactionsService,
    private receiptFinder: ReceiptFinderService,
  ) {}

  @Get('category-hints')
  getCategoryHints(@Request() req: any) {
    return this.service.getCategoryHints(req.user.id);
  }

  @Get('project-hints')
  getProjectHints(@Request() req: any) {
    return this.service.getProjectHints(req.user.id);
  }

  @Get('matches')
  findTransferMatches(
    @Request() req: any,
    @Query('amount') amount: string,
    @Query('date') date: string,
    @Query('excludeAccountId') excludeAccountId: string,
  ) {
    return this.service.findTransferMatches(req.user.id, parseFloat(amount), date, excludeAccountId);
  }

  @Get()
  list(
    @Request() req: any,
    @Query('accountId') accountId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findByUser(req.user.id, accountId, from, to, limit ? parseInt(limit) : 500);
  }

  @Post()
  create(@Request() req: any, @Body() body: { name: string; amount: number; date: string; bankAccountId?: string | null; categoryId?: string | null; debtId?: string | null; note?: string | null }) {
    return this.service.createManual(req.user.id, body);
  }

  @Post('check-duplicates')
  checkDuplicates(
    @Request() req: any,
    @Body() body: { bankAccountId: string; rows: CsvRow[] },
  ) {
    return this.service.checkDuplicates(req.user.id, body.bankAccountId, body.rows);
  }

  @Post('import')
  importCsv(
    @Request() req: any,
    @Body() body: { bankAccountId: string; rows: CsvRow[]; finalBalance?: number },
  ) {
    return this.service.importCsv(req.user.id, body.bankAccountId, body.rows, body.finalBalance);
  }

  @Post(':id/split')
  split(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { splits: { categoryId: string | null; amount: number }[] },
  ) {
    return this.service.split(id, req.user.id, body.splits);
  }

  @Patch(':id')
  updateManual(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { name?: string; amount?: number; date?: string; bankAccountId?: string | null; note?: string | null },
  ) {
    return this.service.updateManual(id, req.user.id, body);
  }

  @Delete(':id/unsplit')
  unsplit(@Param('id') id: string, @Request() req: any) {
    return this.service.unsplit(id, req.user.id);
  }

  @Delete(':id')
  deleteManual(@Param('id') id: string, @Request() req: any) {
    return this.service.deleteManual(id, req.user.id);
  }

  @Patch(':id/category')
  updateCategory(
    @Param('id') id: string,
    @Request() req: any,
    @Body('categoryId') categoryId: string | null,
  ) {
    return this.service.updateCategory(id, req.user.id, categoryId);
  }

  @Patch(':id/debt')
  updateDebt(
    @Param('id') id: string,
    @Request() req: any,
    @Body('debtId') debtId: string | null,
  ) {
    return this.service.updateDebt(id, req.user.id, debtId);
  }

  @Patch(':id/note')
  updateNote(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { note?: string | null },
  ) {
    return this.service.updateNote(id, req.user.id, body.note ?? null);
  }

  @Get(':id/receipt-candidates')
  receiptCandidates(
    @Param('id') id: string,
    @Request() req: any,
    @Query('window') window?: string,
  ) {
    return this.receiptFinder.findCandidates(req.user.id, id, window ? parseInt(window) : 4);
  }

  @Patch(':id/receipt')
  linkReceipt(
    @Param('id') id: string,
    @Request() req: any,
    @Body('receiptId') receiptId: string | null,
  ) {
    return this.receiptFinder.linkReceipt(req.user.id, id, receiptId ?? null);
  }

  @Patch(':id/transfer-account')
  updateTransferAccount(
    @Param('id') id: string,
    @Request() req: any,
    @Body('transferAccountId') transferAccountId: string | null,
    @Body('matchTxId') matchTxId?: string | null,
  ) {
    return this.service.updateTransferAccount(id, req.user.id, transferAccountId, matchTxId);
  }
}
