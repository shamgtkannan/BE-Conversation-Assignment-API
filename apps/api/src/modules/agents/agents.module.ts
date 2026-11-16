import { Module } from '@nestjs/common';
import { CreateAgentUseCase } from 'agents-application';
import { AgentsController } from './agents.controller';

@Module({
  controllers: [AgentsController],
  // Placeholder: becomes a useFactory with the repository once the application layer exists.
  providers: [CreateAgentUseCase],
})
export class AgentsModule {}
