import { isEntityId } from '@shared/core';
import {
  AssignedAgentNotFoundError,
  AssignmentNotPermittedError,
  Conversation,
  ConversationNotFoundError,
  IConversationEntity,
  InvalidConversationError,
  isConversationId,
} from 'conversations-domain';
import { ASSIGNING_ROLES } from './assigning-roles';
import { AgentLookup, Clock, ConversationRepository } from './ports';

/** Input of {@link AssignConversationUseCase}. All of it except the ids comes from the auth context. */
export interface AssignConversationCommand {
  /** Workspace of the authenticated caller. */
  workspaceId: string;
  /** Authenticated user making the assignment; recorded as `assignedBy`. */
  userId: string;
  /** Role of the authenticated user. Only `admin` and `manager` may assign. */
  role: string;
  conversationId: string;
  agentId: string;
}

/**
 * Assigns a conversation of the caller's workspace to an agent of the same
 * workspace, replacing any current agent. Assigning the current agent again is
 * a no-op: nothing is saved.
 *
 * Checks run in this order, so a caller without the right never learns what exists:
 * role, id formats, conversation, agent, then the conversation's own rules.
 *
 * @throws AssignmentNotPermittedError when the role is not admin or manager.
 * @throws InvalidConversationError when either id is malformed.
 * @throws ConversationNotFoundError when the conversation is not in the workspace.
 * @throws AssignedAgentNotFoundError when the agent is not in the workspace.
 * @throws ConversationClosedError when the conversation is closed.
 */
export class AssignConversationUseCase {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly agents: AgentLookup,
    private readonly clock: Clock,
  ) {}

  async execute({
    workspaceId,
    userId,
    role,
    conversationId,
    agentId,
  }: AssignConversationCommand): Promise<IConversationEntity> {
    if (!ASSIGNING_ROLES.includes(role)) {
      throw new AssignmentNotPermittedError(role);
    }
    // Check the formats first, so a malformed id never reaches the database.
    if (!isConversationId(conversationId)) {
      throw new InvalidConversationError(
        'id',
        'Conversation id must be 24 lowercase hexadecimal characters',
      );
    }
    if (!isEntityId(agentId)) {
      throw new InvalidConversationError(
        'assignedAgentId',
        'Assigned agent id must be 24 lowercase hexadecimal characters',
      );
    }

    const stored = await this.conversations.findById(workspaceId, conversationId);
    if (!stored) {
      throw new ConversationNotFoundError(conversationId);
    }
    if (!(await this.agents.exists(workspaceId, agentId))) {
      throw new AssignedAgentNotFoundError(agentId);
    }

    const conversation = Conversation.restore(stored);
    const assigned = conversation.assign(agentId, userId, this.clock.now());
    // The domain hands back the same instance when nothing changed: skip the write.
    if (assigned !== conversation) {
      await this.conversations.save(assigned);
    }
    return assigned;
  }
}
