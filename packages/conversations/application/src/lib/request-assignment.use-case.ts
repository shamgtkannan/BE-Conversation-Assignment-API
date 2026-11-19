import {
  AssignedAgentNotFoundError,
  AssignmentNotPermittedError,
  AssignmentRequestNotSentError,
  CONVERSATION_ASSIGNMENT_REQUESTED_V1,
  ConversationClosedError,
  ConversationNotFoundError,
  InvalidConversationError,
  isConversationId,
} from 'conversations-domain';
import { isEntityId } from '@shared/core';
import { ASSIGNING_ROLES } from './assigning-roles';
import {
  AgentLookup,
  AssignmentRequestPublisher,
  Clock,
  ConversationRepository,
  IdGenerator,
} from './ports';

/** Who is asking, and what for. All of it except the ids comes from the auth context. */
interface RequestAssignmentBase {
  /** Workspace of the authenticated caller. */
  workspaceId: string;
  /** Authenticated user making the request. */
  userId: string;
  /** Role of the authenticated user. Only `admin` and `manager` may ask. */
  role: string;
  conversationId: string;
}

/** Input of {@link RequestAssignmentUseCase}. */
export type RequestAssignmentCommand =
  | (RequestAssignmentBase & { action: 'assign'; agentId: string })
  | (RequestAssignmentBase & { action: 'unassign' });

/** What the caller gets back: the name of the request it just made. */
export interface RequestAssignmentResult {
  commandId: string;
}

/**
 * Asks for a conversation's assignment to change, by publishing a request. The
 * change is made later by whoever consumes the request. Before publishing, this
 * use case reads the stored data to check what it can, so a request that cannot
 * succeed is refused to the caller instead of being sent. It never changes anything.
 *
 * The checks are the ones the assign use case makes, in the same order, so a caller
 * without the right never learns what exists: role, id formats, conversation,
 * agent (assigning only), then whether the conversation is closed (assigning only;
 * removing an agent from a closed conversation is allowed). A request that passes
 * can still be refused later if the data changes in between; that refusal is
 * logged where the request is carried out. Assigning the agent who already has the
 * conversation is published all the same: that it changes nothing is decided there too.
 *
 * @throws AssignmentNotPermittedError when the role is not admin or manager.
 * @throws InvalidConversationError when the conversation id or the agent id is malformed.
 * @throws ConversationNotFoundError when the conversation is not in the workspace.
 * @throws AssignedAgentNotFoundError when the agent to assign is not in the workspace.
 * @throws ConversationClosedError when assigning a closed conversation.
 * @throws AssignmentRequestNotSentError when the request could not be published; the
 * reason is kept as its `cause`. Reading failures are passed on as they are.
 */
export class RequestAssignmentUseCase {
  constructor(
    private readonly requests: AssignmentRequestPublisher,
    private readonly conversations: ConversationRepository,
    private readonly agents: AgentLookup,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: RequestAssignmentCommand): Promise<RequestAssignmentResult> {
    const { workspaceId, userId, role, conversationId } = command;
    if (!ASSIGNING_ROLES.includes(role)) {
      throw new AssignmentNotPermittedError(role);
    }
    if (!isConversationId(conversationId)) {
      throw new InvalidConversationError(
        'id',
        'Conversation id must be 24 lowercase hexadecimal characters',
      );
    }
    if (command.action === 'assign' && !isEntityId(command.agentId)) {
      throw new InvalidConversationError(
        'assignedAgentId',
        'Assigned agent id must be 24 lowercase hexadecimal characters',
      );
    }

    const stored = await this.conversations.findById(workspaceId, conversationId);
    if (!stored) {
      throw new ConversationNotFoundError(conversationId);
    }
    if (command.action === 'assign') {
      if (!(await this.agents.exists(workspaceId, command.agentId))) {
        throw new AssignedAgentNotFoundError(command.agentId);
      }
      if (stored.status === 'closed') {
        throw new ConversationClosedError(conversationId);
      }
    }

    const commandId = this.ids.next();
    const base = {
      type: CONVERSATION_ASSIGNMENT_REQUESTED_V1,
      commandId,
      requestedAt: this.clock.now(),
      workspaceId,
      conversationId,
      requestedBy: userId,
      role,
    } as const;
    try {
      await this.requests.publish(
        command.action === 'assign'
          ? { ...base, action: 'assign', agentId: command.agentId }
          : { ...base, action: 'unassign' },
      );
    } catch (error) {
      // The checks passed but nobody will carry the request out: say so, and keep why for the logs.
      throw new AssignmentRequestNotSentError(error);
    }
    return { commandId };
  }
}
