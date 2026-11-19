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
 * later by whoever consumes the request.
 *
 * STUB: not implemented yet.
 */
@Controller('conversations')
export class AssignmentController {
  constructor(private readonly requestAssignmentUseCase: RequestAssignmentUseCase) {
    void this.requestAssignmentUseCase;
  }

  @Patch(':id/assignment')
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignConversationDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<AssignmentRequestedResponse> {
    void id;
    void dto;
    void auth;
    void toAssignmentRequestedResponse;
    throw new Error('not implemented');
  }

  @Delete(':id/assignment')
  async unassign(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<AssignmentRequestedResponse> {
    void id;
    void auth;
    throw new Error('not implemented');
  }
}
