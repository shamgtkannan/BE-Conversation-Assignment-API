import {
  AssignmentNotPermittedError,
  CONVERSATION_ASSIGNMENT_REQUESTED_V1,
  InvalidConversationError,
  isConversationId,
} from 'conversations-domain';
import { isEntityId } from '@shared/core';
import { ASSIGNING_ROLES } from './assigning-roles';
import { AssignmentRequestPublisher, Clock, IdGenerator } from './ports';

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
 * change is made later by whoever consumes the request; this use case only checks
 * what can be checked without reading data, so a request that can never succeed
 * is not sent. Whether the conversation or the agent exists, and whether the
 * conversation is open, is decided where the request is carried out.
 *
 * Checks run in this order, so a caller without the right never learns what is valid:
 * role, then the id formats.
 *
 * @throws AssignmentNotPermittedError when the role is not admin or manager.
 * @throws InvalidConversationError when the conversation id or the agent id is malformed.
 */
export class RequestAssignmentUseCase {
  constructor(
    private readonly requests: AssignmentRequestPublisher,
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
    await this.requests.publish(
      command.action === 'assign'
        ? { ...base, action: 'assign', agentId: command.agentId }
        : { ...base, action: 'unassign' },
    );
    return { commandId };
  }
}
