import {
  AssignmentNotPermittedError,
  Conversation,
  ConversationNotFoundError,
  IConversationEntity,
  InvalidConversationError,
  isConversationId,
} from 'conversations-domain';
import { ASSIGNING_ROLES } from './assigning-roles';
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
 * Removing an agent is not announced: no event is made from it and no history line.
 *
 * Checks run in this order, so a caller without the right never learns what exists:
 * role, id format, then the conversation.
 *
 * @throws AssignmentNotPermittedError when the role is not admin or manager.
 * @throws InvalidConversationError when the id is malformed.
 * @throws ConversationNotFoundError when the conversation is not in the workspace.
 * @throws ConversationConcurrentModificationError when someone else changed the
 * conversation after it was read here (nothing is written; the caller may retry).
 */
export class UnassignConversationUseCase {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly clock: Clock,
  ) {}

  async execute({
    workspaceId,
    role,
    conversationId,
  }: UnassignConversationCommand): Promise<IConversationEntity> {
    if (!ASSIGNING_ROLES.includes(role)) {
      throw new AssignmentNotPermittedError(role);
    }
    // Check the format first, so a malformed id never reaches the database.
    if (!isConversationId(conversationId)) {
      throw new InvalidConversationError(
        'id',
        'Conversation id must be 24 lowercase hexadecimal characters',
      );
    }

    const stored = await this.conversations.findById(workspaceId, conversationId);
    if (!stored) {
      throw new ConversationNotFoundError(conversationId);
    }

    const conversation = Conversation.restore(stored);
    const unassigned = conversation.unassign(this.clock.now());
    // The domain hands back the same instance when nothing changed: skip the write.
    if (unassigned !== conversation) {
      await this.conversations.save(unassigned, stored.version);
    }
    return unassigned;
  }
}
