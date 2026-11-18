import { ConversationEvent, historyEntryFromEvent } from 'conversations-domain';
import { AssignmentHistoryRepository } from './ports';

/**
 * Records a conversation event in the assignment history. Called for every
 * event that arrives, however often the same one is delivered: each event is
 * recorded once, because the repository refuses a second line for the same event.
 */
export class RecordAssignmentHistoryUseCase {
  constructor(private readonly history: AssignmentHistoryRepository) {}

  /**
   * @returns `true` when the event was recorded now, `false` when it had been recorded before.
   * A storage failure is passed on, so the event is delivered again and recorded later.
   */
  async execute(event: ConversationEvent): Promise<boolean> {
    return this.history.record(historyEntryFromEvent(event));
  }
}
