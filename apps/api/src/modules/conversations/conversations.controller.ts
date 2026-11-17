import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  AssignConversationUseCase,
  CreateConversationUseCase,
  GetConversationUseCase,
  ListConversationsUseCase,
} from 'conversations-application';
import { AuthContext } from '../../auth/auth-context';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import {
  ConversationPageResponse,
  ConversationResponse,
  toConversationPageResponse,
  toConversationResponse,
} from './conversation.response';
import { AssignConversationDto } from './dto/assign-conversation.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';

/** HTTP entry point for conversations. It only delegates; the rules live in the use cases. */
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly createConversationUseCase: CreateConversationUseCase,
    private readonly getConversationUseCase: GetConversationUseCase,
    private readonly listConversationsUseCase: ListConversationsUseCase,
    private readonly assignConversationUseCase: AssignConversationUseCase,
  ) {}

  /**
   * `PATCH /conversations/:id/assignment`: assigns the conversation to an agent
   * of the caller's workspace (200), replacing any current agent. Only admins
   * and managers may (403). A malformed id or body is 400; an unknown
   * conversation or agent is 404; a closed conversation is 409.
   */
  @Patch(':id/assignment')
  async assign(
    @Param('id') _id: string,
    @Body() _dto: AssignConversationDto,
    @CurrentAuth() _auth: AuthContext,
  ): Promise<ConversationResponse> {
    void this.assignConversationUseCase;
    throw new Error('not implemented');
  }

  /**
   * `GET /conversations`: one page of the caller's workspace, newest first
   * (200), optionally filtered by `status` and `assignedAgentId`. Any
   * authenticated role may list. Bad paging or filter values become 400.
   */
  @Get()
  async list(
    @Query() query: ListConversationsQueryDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<ConversationPageResponse> {
    const page = await this.listConversationsUseCase.execute({
      workspaceId: auth.workspaceId,
      status: query.status,
      assignedAgentId: query.assignedAgentId,
      limit: query.limit,
      next: query.next,
      previous: query.previous,
    });
    return toConversationPageResponse(page);
  }

  /**
   * `GET /conversations/:id`: one conversation of the caller's workspace (200).
   * Any authenticated role may read. A malformed id is 400; an unknown id, or one
   * from another workspace, is 404.
   */
  @Get(':id')
  async getOne(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<ConversationResponse> {
    const conversation = await this.getConversationUseCase.execute({
      workspaceId: auth.workspaceId,
      id,
    });
    return toConversationResponse(conversation);
  }

  /**
   * `POST /conversations`: creates an unassigned conversation in the caller's
   * workspace (201). Any authenticated role may create. Domain errors become
   * 400 through the global `DomainExceptionFilter`.
   */
  @Post()
  async create(
    @Body() dto: CreateConversationDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<ConversationResponse> {
    const conversation = await this.createConversationUseCase.execute({
      workspaceId: auth.workspaceId,
      subject: dto.subject,
      status: dto.status,
    });
    return toConversationResponse(conversation);
  }
}
