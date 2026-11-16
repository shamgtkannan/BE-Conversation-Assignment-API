import { Body, Controller, Get, NotImplementedException, Post, Query } from '@nestjs/common';
import { CreateAgentUseCase, ListAgentsUseCase } from 'agents-application';
import { AuthContext } from '../../auth/auth-context';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { AgentPageResponse, AgentResponse, toAgentResponse } from './agent.response';
import { CreateAgentDto } from './dto/create-agent.dto';
import { ListAgentsQueryDto } from './dto/list-agents-query.dto';

/** HTTP entry point for agents. It only delegates; the rules live in the use cases. */
@Controller('agents')
export class AgentsController {
  constructor(
    private readonly createAgentUseCase: CreateAgentUseCase,
    private readonly listAgentsUseCase: ListAgentsUseCase,
  ) {}

  /**
   * `GET /agents`: one page of the caller's workspace, newest first. Not implemented yet.
   */
  @Get()
  list(
    @Query() query: ListAgentsQueryDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<AgentPageResponse> {
    void query;
    void auth;
    void this.listAgentsUseCase;
    throw new NotImplementedException();
  }

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
