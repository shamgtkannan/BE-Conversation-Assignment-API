import { IConversationEntity } from 'conversations-domain';
import { Clock, ConversationRepository } from './ports';

/** Input of {@link UnassignConversationUseCase}. All of it except the id comes from the auth context. */
export interface UnassignConversationCommand {
  /** Workspace of the authenticated caller. */
  workspaceId: string;
  /** Role of the authenticated user. Only `admin` and `manager` may unassign. */
  role: string;
  conversationId: string;
}

/**
 * Removes the assignment from a conversation of the caller's workspace,
 * clearing `assignedAgentId`, `assignedAt` and `assignedBy`. A conversation
 * nobody is assigned to is returned as it is and nothing is saved. A closed
 * conversation can be unassigned.
 *
 * Checks run in this order, so a caller without the right never learns what exists:
 * role, id format, then the conversation.
 *
 * @throws AssignmentNotPermittedError when the role is not admin or manager.
 * @throws InvalidConversationError when the id is malformed.
 * @throws ConversationNotFoundError when the conversation is not in the workspace.
 */
export class UnassignConversationUseCase {
  constructor(
    protected readonly conversations: ConversationRepository,
    protected readonly clock: Clock,
  ) {}

  async execute(_command: UnassignConversationCommand): Promise<IConversationEntity> {
    throw new Error('not implemented');
  }
}
