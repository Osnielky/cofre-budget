import { BadRequestException, Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InvestmentsService } from './investments.service';

/* Trading performance is derived from data the user already pays for, so it is
   open to every plan. Only the live value of open positions (Plaid Holdings) is
   a candidate for gating later. */
@UseGuards(JwtAuthGuard)
@Controller('investments')
export class InvestmentsController {
  constructor(private service: InvestmentsService) {}

  /** `?accountId=` → one account; `?projectId=` → every account the project follows plus the combined result. */
  @Get('performance')
  performance(@Query('accountId') accountId: string | undefined, @Query('projectId') projectId: string | undefined, @Request() req: any) {
    if (projectId) return this.service.performanceForProject(req.user.id, projectId);
    if (accountId) return this.service.performance(req.user.id, accountId);
    throw new BadRequestException('accountId or projectId is required');
  }
}
