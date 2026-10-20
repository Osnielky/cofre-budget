import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { BlockedInDemo } from '../common/demo/blocked-in-demo.decorator';
import { isDemoRestricted } from '../common/demo/demo-restricted';
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
    // Demo accounts never send mail: a sandbox could otherwise relay receipts to any address.
    const safe = isDemoRestricted(req.user) ? { ...dto, emailReceipt: false } : dto;
    return this.service.addPayment(id, req.user.id, req.user.name || req.user.email, safe);
  }

  @Delete(':id/payments/:pid')
  removePayment(@Param('id') id: string, @Param('pid') pid: string, @Request() req: any) {
    return this.service.removePayment(id, pid, req.user.id);
  }

  @BlockedInDemo()
  @Post(':id/send-statement')
  sendStatement(@Param('id') id: string, @Request() req: any) {
    return this.service.sendStatement(id, req.user.id, req.user.name || req.user.email);
  }
}
