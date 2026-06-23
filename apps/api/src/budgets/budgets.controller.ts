import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BudgetsService } from './budgets.service';

@UseGuards(JwtAuthGuard)
@Controller('budgets')
export class BudgetsController {
  constructor(private service: BudgetsService) {}

  @Get('months')
  months(@Request() req: any) {
    return this.service.getMonthSummaries(req.user.id);
  }

  @Get('category-averages')
  categoryAverages(@Request() req: any, @Query('months') months?: string) {
    return this.service.categoryAverages(req.user.id, months ? parseInt(months, 10) : 3);
  }

  @Get()
  list(@Request() req: any, @Query('month') month?: string) {
    const m = month ?? currentMonth();
    return this.service.findWithSpent(req.user.id, m);
  }

  @Post('ensure-month')
  @HttpCode(200)
  ensureMonth(@Request() req: any, @Body() body: { month: string }) {
    return this.service.ensureMonthBudgets(req.user.id, body.month ?? currentMonth());
  }

  @Post('copy')
  @HttpCode(200)
  copy(@Request() req: any, @Body() body: { fromMonth: string; toMonth: string }) {
    return this.service.copyMonth(req.user.id, body.fromMonth, body.toMonth);
  }

  @Post()
  create(@Request() req: any, @Body() body: { categoryId: string; amount: number; month?: string; projectId?: string | null }) {
    return this.service.create(req.user.id, { ...body, month: body.month ?? currentMonth() });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Request() req: any, @Body() body: { amount: number; projectId?: string | null }) {
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
