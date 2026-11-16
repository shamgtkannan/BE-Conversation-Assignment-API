import { Controller, NotImplementedException, Post } from '@nestjs/common';
import { CreateAgentUseCase } from 'agents-application';
import { AgentResponse } from './agent.response';

/** HTTP entry point for agents. It only delegates; the rules live in the use case. */
@Controller('agents')
export class AgentsController {
  constructor(private readonly createAgentUseCase: CreateAgentUseCase) {}

  /** `POST /agents`: creates an agent in the caller's workspace. Not implemented yet. */
  @Post()
  create(): Promise<AgentResponse> {
    throw new NotImplementedException();
  }
}
