import { Logger } from '@nestjs/common';
import { RecordAssignmentHistoryUseCase } from 'conversations-application';

/**
 * Turns one Kafka message into a call of the history use case.
 *
 * - A message that is not a conversation event is logged and skipped. Retrying
 *   cannot fix it, and it must not block the messages behind it.
 * - A failure of the use case (the database is down, say) is thrown, so the
 *   message is delivered again later.
 *
 * STUB: not implemented yet.
 */
export class AssignmentHistoryMessageHandler {
  private readonly logger = new Logger(AssignmentHistoryMessageHandler.name);

  constructor(private readonly recordHistory: Pick<RecordAssignmentHistoryUseCase, 'execute'>) {
    void this.recordHistory;
    void this.logger;
  }

  async handle(value: Buffer | null): Promise<void> {
    void value;
    throw new Error('not implemented');
  }
}
