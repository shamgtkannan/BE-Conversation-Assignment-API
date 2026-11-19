import { Logger } from '@nestjs/common';
import { RecordAssignmentHistoryUseCase } from 'conversations-application';
import { InvalidEventMessageError, decodeConversationEvent } from 'conversations-infra';

/**
 * Turns one Kafka message into a call of the history use case.
 *
 * - A message that is not a conversation event is logged and skipped. Retrying
 *   cannot fix it, and it must not block the messages behind it.
 * - A failure of the use case (the database is down, say) is thrown, so the
 *   message is delivered again later.
 */
export class AssignmentHistoryMessageHandler {
  private readonly logger = new Logger(AssignmentHistoryMessageHandler.name);

  constructor(private readonly recordHistory: Pick<RecordAssignmentHistoryUseCase, 'execute'>) {}

  async handle(value: Buffer | null): Promise<void> {
    if (value === null) {
      this.logger.warn('Skipping an empty message');
      return;
    }
    let event;
    try {
      event = decodeConversationEvent(value.toString('utf8'));
    } catch (error) {
      if (error instanceof InvalidEventMessageError) {
        this.logger.warn(`Skipping a message: ${error.message}`);
        return;
      }
      throw error;
    }
    await this.recordHistory.execute(event);
  }
}
