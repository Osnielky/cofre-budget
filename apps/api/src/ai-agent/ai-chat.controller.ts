import { Controller, Post, Param, Body, UseGuards, Request, Res, ForbiddenException } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlanGuard } from '../auth/guards/plan.guard';
import { RequiresPlan } from '../auth/decorators/require-plan.decorator';
import { AiChatService } from './ai-chat.service';
import { AiConversationsService } from './ai-conversations.service';
import { messageUsage, usageWindowStart } from './ai-usage';

@UseGuards(JwtAuthGuard, PlanGuard)
@RequiresPlan('pro', 'elite')
@Controller('ai/conversations')
export class AiChatController {
  constructor(
    private chat: AiChatService,
    private conversations: AiConversationsService,
  ) {}

  /** Messages used in the plan's current window (UTC day for Pro, UTC month for Elite). */
  private async usage(req: any) {
    const now = new Date();
    const isDemo = !!req.user.isDemo;
    const used = await this.conversations.countUserMessagesSince(req.user.id, usageWindowStart(req.user.plan, now, isDemo));
    return messageUsage(req.user.plan, used, now, isDemo);
  }

  @Post(':id/messages')
  async sendMessage(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { content: string; month?: string },
    @Res() res: Response,
  ) {
    const before = await this.usage(req);
    if (before.remaining <= 0) {
      throw new ForbiddenException({
        message: before.period === 'month'
          ? `You've used all ${before.limit} of this month's Ask Cofre messages. They reset on the 1st (UTC).`
          : `You've used all ${before.limit} of today's Ask Cofre messages. They reset at midnight UTC.`,
        code: 'AI_MESSAGE_LIMIT',
        usage: before,
      });
    }

    await this.conversations.appendUserMessage(id, req.user.id, body.content);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    try {
      const result = await this.chat.sendMessage({
        userId: req.user.id,
        conversationId: id,
        userText: body.content,
        monthContext: body.month ?? null,
        onTextDelta: (text) => res.write(`data: ${JSON.stringify({ type: 'text_delta', text })}\n\n`),
      });
      const message = await this.conversations.appendAssistantMessage(id, result.text, result.widget);
      const usage = await this.usage(req);
      res.write(`data: ${JSON.stringify({ type: 'done', message, usage })}\n\n`);
    } catch (err) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Something went wrong. Please try again.' })}\n\n`);
    } finally {
      res.end();
    }
  }
}
