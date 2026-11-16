import { Module } from '@nestjs/common';
import { AgentsModule } from '../modules/agents/agents.module';
import { ConversationsModule } from '../modules/conversations/conversations.module';

@Module({
  imports: [AgentsModule, ConversationsModule],
})
export class AppModule {}
