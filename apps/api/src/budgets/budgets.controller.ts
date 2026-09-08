import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BudgetsService, BudgetSettings } from './budgets.service';

@UseGuards(JwtAuthGuard)
@Controller('budgets')
export class BudgetsController {
  constructor(private service: BudgetsService) {}

  @Get('months')
  months(@Request() req: any) {
    return this.service.getMonthSummaries(req.user.id);
  }

  @Get('category-averages')
  categoryAverages(@Request() req: any, @Query('months') months?: string, @Query('month') month?: string) {
    return this.service.categoryAverages(req.user.id, months ? parseInt(months, 10) : 3, month);
  }

  @Get('history')
  history(@Request() req: any, @Query('months') months?: string) {
    return this.service.history(req.user.id, months ? parseInt(months, 10) : 6);
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
  create(@Request() req: any, @Body() body: { categoryId?: string | null; amount: number; month?: string; projectId?: string | null; projectCategoryId?: string | null } & BudgetSettings) {
    return this.service.create(req.user.id, { ...body, ...settings(body), month: body.month ?? currentMonth() });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Request() req: any, @Body() body: { amount: number; projectId?: string | null } & BudgetSettings) {
    return this.service.update(id, req.user.id, { ...body, ...settings(body) });
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

/** Keep only the settings the caller actually sent, coerced to safe values.
    An absent field stays absent so the service leaves the stored value alone. */
function settings(body: BudgetSettings): BudgetSettings {
  const out: BudgetSettings = {};
  if (body.notifyEnabled !== undefined) out.notifyEnabled = !!body.notifyEnabled;
  if (body.notifyThreshold !== undefined) {
    const n = Math.round(Number(body.notifyThreshold));
    if (Number.isFinite(n)) out.notifyThreshold = Math.min(Math.max(n, 1), 100);
  }
  if (body.rollover !== undefined) out.rollover = !!body.rollover;
  if (body.isRecurring !== undefined) out.isRecurring = !!body.isRecurring;
  return out;
}
