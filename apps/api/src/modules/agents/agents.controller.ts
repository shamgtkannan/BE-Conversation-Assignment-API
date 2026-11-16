import { Body, Controller, Post } from '@nestjs/common';
import { CreateAgentUseCase } from 'agents-application';
import { AuthContext } from '../../auth/auth-context';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { AgentResponse, toAgentResponse } from './agent.response';
import { CreateAgentDto } from './dto/create-agent.dto';

/** HTTP entry point for agents. It only delegates; the rules live in the use case. */
@Controller('agents')
export class AgentsController {
  constructor(private readonly createAgentUseCase: CreateAgentUseCase) {}

  /**
   * `POST /agents`: creates an agent in the caller's workspace (201).
   * Any authenticated role may create agents. Domain errors are translated to
   * 400 and 409 by the global `DomainExceptionFilter`.
   */
  @Post()
  async create(
    @Body() dto: CreateAgentDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<AgentResponse> {
    const agent = await this.createAgentUseCase.execute({
      workspaceId: auth.workspaceId,
      name: dto.name,
      email: dto.email,
    });
    return toAgentResponse(agent);
  }
}
