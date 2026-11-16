import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CreateAgentUseCase, ListAgentsUseCase } from 'agents-application';
import { AuthContext } from '../../auth/auth-context';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import {
  AgentPageResponse,
  AgentResponse,
  toAgentPageResponse,
  toAgentResponse,
} from './agent.response';
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
   * `GET /agents`: one page of the caller's workspace, newest first (200).
   * Any authenticated role may list. Bad paging parameters become 400.
   */
  @Get()
  async list(
    @Query() query: ListAgentsQueryDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<AgentPageResponse> {
    const page = await this.listAgentsUseCase.execute({
      workspaceId: auth.workspaceId,
      limit: query.limit,
      next: query.next,
      previous: query.previous,
    });
    return toAgentPageResponse(page);
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
