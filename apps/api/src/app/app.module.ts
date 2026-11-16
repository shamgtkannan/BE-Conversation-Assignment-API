import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '../auth/auth.guard';
import { DomainExceptionFilter } from '../common/domain-exception.filter';
import { AgentsModule } from '../modules/agents/agents.module';
import { ConversationsModule } from '../modules/conversations/conversations.module';

@Module({
  imports: [AgentsModule, ConversationsModule],
  providers: [
    // Global: every route requires an authenticated caller.
    { provide: APP_GUARD, useClass: AuthGuard },
    // Global: domain errors become HTTP statuses in one place.
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
