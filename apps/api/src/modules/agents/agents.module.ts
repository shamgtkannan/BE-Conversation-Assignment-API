import { Module } from '@nestjs/common';
import {
  AGENT_REPOSITORY,
  AgentRepository,
  CLOCK,
  Clock,
  CreateAgentUseCase,
  ID_GENERATOR,
  IdGenerator,
  ListAgentsUseCase,
} from 'agents-application';
import { AgentRepositoryModule } from 'agents-infra';
import { SystemClock } from '../../common/system-clock';
import { AgentsController } from './agents.controller';

/**
 * Wires the agents feature: ports are bound to MongoDB adapters by
 * `AgentRepositoryModule`, and the use case, a plain class without Nest
 * decorators, is assembled here with `useFactory`.
 */
@Module({
  imports: [AgentRepositoryModule],
  controllers: [AgentsController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    {
      provide: CreateAgentUseCase,
      useFactory: (agents: AgentRepository, ids: IdGenerator, clock: Clock) =>
        new CreateAgentUseCase(agents, ids, clock),
      inject: [AGENT_REPOSITORY, ID_GENERATOR, CLOCK],
    },
    {
      provide: ListAgentsUseCase,
      useFactory: (agents: AgentRepository) => new ListAgentsUseCase(agents),
      inject: [AGENT_REPOSITORY],
    },
  ],
})
export class AgentsModule {}
