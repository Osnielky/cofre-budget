import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TransactionsService, CsvRow } from './transactions.service';

@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private service: TransactionsService) {}

  @Get()
  list(
    @Request() req: any,
    @Query('accountId') accountId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findByUser(req.user.id, accountId, limit ? parseInt(limit) : 50);
  }

  @Post('import')
  importCsv(
    @Request() req: any,
    @Body() body: { bankAccountId: string; rows: CsvRow[] },
  ) {
    return this.service.importCsv(req.user.id, body.bankAccountId, body.rows);
  }

  @Patch(':id/category')
  updateCategory(
    @Param('id') id: string,
    @Request() req: any,
    @Body('category') category: string,
  ) {
    return this.service.updateCategory(id, req.user.id, category);
  }
}
