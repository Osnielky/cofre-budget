import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TransactionsService, CsvRow } from './transactions.service';

@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private service: TransactionsService) {}

  @Get('category-hints')
  getCategoryHints(@Request() req: any) {
    return this.service.getCategoryHints(req.user.id);
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
  create(@Request() req: any, @Body() body: { name: string; amount: number; date: string; bankAccountId?: string | null; categoryId?: string | null }) {
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
    @Body() body: { bankAccountId: string; rows: CsvRow[] },
  ) {
    return this.service.importCsv(req.user.id, body.bankAccountId, body.rows);
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
