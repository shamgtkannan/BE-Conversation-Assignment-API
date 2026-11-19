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
 * is not sent.
 *
 * STUB: not implemented yet.
 *
 * @throws AssignmentNotPermittedError when the role is not admin or manager.
 * @throws InvalidConversationError when the conversation id or the agent id is malformed.
 */
export class RequestAssignmentUseCase {
  constructor(
    private readonly requests: AssignmentRequestPublisher,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {
    void this.requests;
    void this.clock;
    void this.ids;
  }

  async execute(command: RequestAssignmentCommand): Promise<RequestAssignmentResult> {
    void command;
    throw new Error('not implemented');
  }
}
