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

  @Get('performance')
  performance(@Query('accountId') accountId: string | undefined, @Request() req: any) {
    if (!accountId) throw new BadRequestException('accountId is required');
    return this.service.performance(req.user.id, accountId);
  }
}
