import { Controller, Get, Post, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlanGuard } from '../auth/guards/plan.guard';
import { RequiresPlan } from '../auth/decorators/require-plan.decorator';
import { AiActionsService } from './ai-actions.service';

@UseGuards(JwtAuthGuard, PlanGuard)
@RequiresPlan('pro', 'elite')
@Controller('ai/actions')
export class AiActionsController {
  constructor(private service: AiActionsService) {}

  @Get('recent')
  recent(@Request() req: any) {
    return this.service.recent(req.user.id);
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string, @Request() req: any) {
    return this.service.confirm(id, req.user.id);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Request() req: any) {
    return this.service.reject(id, req.user.id);
  }

  @Post(':id/undo')
  undo(@Param('id') id: string, @Request() req: any) {
    return this.service.undo(id, req.user.id);
  }
}
