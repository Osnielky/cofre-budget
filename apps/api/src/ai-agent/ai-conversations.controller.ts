import { Controller, Get, Post, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlanGuard } from '../auth/guards/plan.guard';
import { RequiresPlan } from '../auth/decorators/require-plan.decorator';
import { AiConversationsService } from './ai-conversations.service';

@UseGuards(JwtAuthGuard, PlanGuard)
@RequiresPlan('pro', 'elite')
@Controller('ai/conversations')
export class AiConversationsController {
  constructor(private service: AiConversationsService) {}

  @Post()
  create(@Request() req: any) {
    return this.service.create(req.user.id);
  }

  @Get()
  list(@Request() req: any) {
    return this.service.findAllByUser(req.user.id);
  }

  @Get(':id/messages')
  messages(@Param('id') id: string, @Request() req: any) {
    return this.service.findMessages(id, req.user.id);
  }
}
