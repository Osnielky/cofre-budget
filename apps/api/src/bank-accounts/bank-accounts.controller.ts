import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BankAccountsService } from './bank-accounts.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';

@UseGuards(JwtAuthGuard)
@Controller('bank-accounts')
export class BankAccountsController {
  constructor(private service: BankAccountsService) {}

  @Get()
  list(@Request() req: any) {
    return this.service.findAllByUser(req.user.id);
  }

  @Post()
  create(@Request() req: any, @Body() dto: CreateBankAccountDto) {
    return this.service.create(req.user.id, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Request() req: any, @Body() dto: Partial<CreateBankAccountDto>) {
    return this.service.update(id, req.user.id, dto);
  }

  @Get(':id/transaction-count')
  async transactionCount(@Param('id') id: string, @Request() req: any) {
    return { count: await this.service.countTransactions(id, req.user.id) };
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id') id: string,
    @Request() req: any,
    @Query('deleteTransactions') deleteTransactions?: string,
  ) {
    return this.service.remove(id, req.user.id, deleteTransactions === 'true');
  }
}
