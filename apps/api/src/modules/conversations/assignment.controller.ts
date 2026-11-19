import { Body, Controller, Delete, Param, Patch } from '@nestjs/common';
import { RequestAssignmentUseCase } from 'conversations-application';
import { AuthContext } from '../../auth/auth-context';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import {
  AssignmentRequestedResponse,
  toAssignmentRequestedResponse,
} from './assignment-requested.response';
import { AssignConversationDto } from './dto/assign-conversation.dto';

/**
 * HTTP entry point for changing a conversation's assignment. It asks: the request
 * is published and the call answers `200` at once, and the change is made a moment
 * later by whoever consumes the request. The answer names the request; it does not
 * describe the conversation, which is read with `GET /conversations/:id`.
 *
 * What can be known before sending is still answered here, by the use case: `403`
 * for a role that may not ask, `400` for a malformed id or body, `404` for a
 * conversation or agent that is not in the caller's workspace, `409` for assigning a
 * closed conversation. `503` means the request could not be sent. The workspace and
 * the user come from the auth context, never from the body.
 */
@Controller('conversations')
export class AssignmentController {
  constructor(private readonly requestAssignmentUseCase: RequestAssignmentUseCase) {}

  /** `PATCH /conversations/:id/assignment`: asks for the conversation to be assigned to an agent. */
  @Patch(':id/assignment')
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignConversationDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<AssignmentRequestedResponse> {
    const result = await this.requestAssignmentUseCase.execute({
      action: 'assign',
      workspaceId: auth.workspaceId,
      userId: auth.userId,
      role: auth.role,
      conversationId: id,
      agentId: dto.agentId,
    });
    return toAssignmentRequestedResponse(result);
  }

  /** `DELETE /conversations/:id/assignment`: asks for the conversation's agent to be removed. */
  @Delete(':id/assignment')
  async unassign(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<AssignmentRequestedResponse> {
    const result = await this.requestAssignmentUseCase.execute({
      action: 'unassign',
      workspaceId: auth.workspaceId,
      userId: auth.userId,
      role: auth.role,
      conversationId: id,
    });
    return toAssignmentRequestedResponse(result);
  }
}
