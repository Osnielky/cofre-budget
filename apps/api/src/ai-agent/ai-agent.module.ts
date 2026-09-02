import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiConversation } from './ai-conversation.entity';
import { AiMessage } from './ai-message.entity';
import { AiPendingAction } from './ai-pending-action.entity';
import { AiConversationsService } from './ai-conversations.service';
import { AiConversationsController } from './ai-conversations.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AiConversation, AiMessage, AiPendingAction])],
  providers: [AiConversationsService],
  controllers: [AiConversationsController],
  exports: [AiConversationsService],
})
export class AiAgentModule {}
