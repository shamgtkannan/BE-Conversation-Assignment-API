import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '../auth/auth.guard';
import { AgentsModule } from '../modules/agents/agents.module';
import { ConversationsModule } from '../modules/conversations/conversations.module';

@Module({
  imports: [AgentsModule, ConversationsModule],
  // Global: every route requires an authenticated caller.
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
