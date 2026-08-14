import { Controller, Get, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NetWorthGoalService } from './net-worth-goal.service';

@UseGuards(JwtAuthGuard)
@Controller('net-worth-goal')
export class NetWorthGoalController {
  constructor(private service: NetWorthGoalService) {}

  @Get()
  get(@Request() req: any) {
    return this.service.get(req.user.id);
  }

  @Patch()
  setTargetDate(@Request() req: any, @Body() body: { targetDate: string | null }) {
    return this.service.setTargetDate(req.user.id, body.targetDate ?? null);
  }
}
