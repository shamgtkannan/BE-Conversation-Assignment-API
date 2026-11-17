import { IConversationEntity } from 'conversations-domain';
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
    protected readonly conversations: ConversationRepository,
    protected readonly agents: AgentLookup,
    protected readonly clock: Clock,
  ) {}

  async execute(_command: AssignConversationCommand): Promise<IConversationEntity> {
    throw new Error('not implemented');
  }
}
