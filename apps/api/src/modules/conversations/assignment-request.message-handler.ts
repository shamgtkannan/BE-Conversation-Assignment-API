import { Logger } from '@nestjs/common';
import { AssignConversationUseCase, UnassignConversationUseCase } from 'conversations-application';

/**
 * Carries out one assignment request read from Kafka: it hands the request to
 * the assign or the unassign use case, which make the change and announce it.
 *
 * - A message that is not an assignment request is logged and skipped.
 * - A request the use case refuses on business grounds (not allowed, not found,
 *   closed, malformed ids) is logged and finished: running it again gives the same answer.
 * - Anything else (the database is down, another request changed the conversation
 *   first) is thrown, so the message is delivered again and carried out later.
 *
 * STUB: not implemented yet.
 */
export class AssignmentRequestMessageHandler {
  private readonly logger = new Logger(AssignmentRequestMessageHandler.name);

  constructor(
    private readonly assign: Pick<AssignConversationUseCase, 'execute'>,
    private readonly unassign: Pick<UnassignConversationUseCase, 'execute'>,
  ) {
    void this.assign;
    void this.unassign;
    void this.logger;
  }

  async handle(value: Buffer | null): Promise<void> {
    void value;
    throw new Error('not implemented');
  }
}
