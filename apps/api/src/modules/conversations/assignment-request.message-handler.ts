import { Logger } from '@nestjs/common';
import { AssignConversationUseCase, UnassignConversationUseCase } from 'conversations-application';
import {
  AssignedAgentNotFoundError,
  AssignmentNotPermittedError,
  ConversationClosedError,
  ConversationNotFoundError,
  InvalidConversationError,
} from 'conversations-domain';
import { InvalidRequestMessageError, decodeAssignmentRequest } from 'conversations-infra';

/** Refusals that running the request again would repeat: the request is finished. */
const isBusinessRefusal = (error: unknown): boolean =>
  error instanceof AssignmentNotPermittedError ||
  error instanceof InvalidConversationError ||
  error instanceof ConversationNotFoundError ||
  error instanceof AssignedAgentNotFoundError ||
  error instanceof ConversationClosedError;

/**
 * Carries out one assignment request read from Kafka: it hands the request to
 * the assign or the unassign use case, which make the change and announce it.
 *
 * - A message that is not an assignment request is logged and skipped.
 * - A request the use case refuses on business grounds (not allowed, not found,
 *   closed, malformed ids) is logged and finished: running it again gives the same answer.
 * - Anything else (the database is down, another request changed the conversation
 *   first) is thrown, so the message is delivered again and carried out later.
 */
export class AssignmentRequestMessageHandler {
  private readonly logger = new Logger(AssignmentRequestMessageHandler.name);

  constructor(
    private readonly assign: Pick<AssignConversationUseCase, 'execute'>,
    private readonly unassign: Pick<UnassignConversationUseCase, 'execute'>,
  ) {}

  async handle(value: Buffer | null): Promise<void> {
    if (value === null) {
      this.logger.warn('Skipping an empty message');
      return;
    }
    let request;
    try {
      request = decodeAssignmentRequest(value.toString('utf8'));
    } catch (error) {
      if (error instanceof InvalidRequestMessageError) {
        this.logger.warn(`Skipping a message: ${error.message}`);
        return;
      }
      throw error;
    }

    const { workspaceId, requestedBy: userId, role, conversationId } = request;
    try {
      if (request.action === 'assign') {
        await this.assign.execute({ workspaceId, userId, role, conversationId, agentId: request.agentId });
      } else {
        await this.unassign.execute({ workspaceId, userId, role, conversationId });
      }
    } catch (error) {
      if (!isBusinessRefusal(error)) throw error;
      this.logger.warn(`Request ${request.commandId} refused: ${(error as Error).message}`);
    }
  }
}
