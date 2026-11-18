import { Controller, Get, Param, Query } from '@nestjs/common';
import { ListAssignmentHistoryUseCase } from 'conversations-application';
import { AuthContext } from '../../auth/auth-context';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import {
  AssignmentHistoryPageResponse,
  toAssignmentHistoryPageResponse,
} from './assignment-history.response';
import { ListAssignmentHistoryQueryDto } from './dto/list-assignment-history-query.dto';

/** HTTP entry point for a conversation's assignment history. */
@Controller('conversations')
export class AssignmentHistoryController {
  constructor(private readonly listAssignmentHistoryUseCase: ListAssignmentHistoryUseCase) {}

  /**
   * `GET /conversations/:id/assignment-history`: one page of the conversation's
   * assignment history, newest first (200). Any authenticated role may read. A
   * malformed id or bad paging value is 400; an unknown conversation, or one from
   * another workspace, is 404.
   */
  @Get(':id/assignment-history')
  async list(
    @Param('id') id: string,
    @Query() query: ListAssignmentHistoryQueryDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<AssignmentHistoryPageResponse> {
    const page = await this.listAssignmentHistoryUseCase.execute({
      workspaceId: auth.workspaceId,
      conversationId: id,
      limit: query.limit,
      next: query.next,
      previous: query.previous,
    });
    return toAssignmentHistoryPageResponse(page);
  }
}
