import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BudgetsService } from './budgets.service';

@UseGuards(JwtAuthGuard)
@Controller('budgets')
export class BudgetsController {
  constructor(private service: BudgetsService) {}

  @Get()
  list(@Request() req: any, @Query('month') month?: string) {
    const m = month ?? currentMonth();
    return this.service.findWithSpent(req.user.id, m);
  }

  @Post()
  create(@Request() req: any, @Body() body: { categoryId: string; amount: number }) {
    return this.service.create(req.user.id, body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Request() req: any, @Body() body: { amount: number }) {
    return this.service.update(id, req.user.id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Request() req: any) {
    return this.service.remove(id, req.user.id);
  }
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
