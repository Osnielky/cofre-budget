import { Controller, Get, Post, Delete, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlanGuard } from '../auth/guards/plan.guard';
import { RequiresPlan } from '../auth/decorators/require-plan.decorator';
import { AiConversationsService } from './ai-conversations.service';
import { messageUsage } from './ai-usage';

@UseGuards(JwtAuthGuard, PlanGuard)
@RequiresPlan('pro', 'elite')
@Controller('ai/conversations')
export class AiConversationsController {
  constructor(private service: AiConversationsService) {}

  @Post()
  create(@Request() req: any) {
    return this.service.create(req.user.id);
  }

  /** How many Ask Cofre messages the user has left today. */
  @Get('usage')
  async usage(@Request() req: any) {
    return messageUsage(req.user.plan, await this.service.countUserMessagesToday(req.user.id), new Date(), !!req.user.isDemo);
  }

  @Get()
  list(@Request() req: any) {
    return this.service.findAllByUser(req.user.id);
  }

  @Get(':id/messages')
  messages(@Param('id') id: string, @Request() req: any) {
    return this.service.findMessages(id, req.user.id);
  }

  /** Clear the whole history. */
  @Delete()
  async removeAll(@Request() req: any) {
    return { deleted: await this.service.removeAll(req.user.id) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: any) {
    await this.service.remove(id, req.user.id);
    return { ok: true };
  }
}
