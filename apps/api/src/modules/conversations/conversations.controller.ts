import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateConversationUseCase, GetConversationUseCase } from 'conversations-application';
import { AuthContext } from '../../auth/auth-context';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { ConversationResponse, toConversationResponse } from './conversation.response';
import { CreateConversationDto } from './dto/create-conversation.dto';

/** HTTP entry point for conversations. It only delegates; the rules live in the use cases. */
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly createConversationUseCase: CreateConversationUseCase,
    private readonly getConversationUseCase: GetConversationUseCase,
  ) {}

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
