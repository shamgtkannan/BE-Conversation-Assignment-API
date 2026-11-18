import { ConversationEvent } from 'conversations-domain';
import { AssignmentHistoryRepository } from './ports';

/**
 * Records a conversation event in the assignment history. Called for every
 * event that arrives, however often the same one is delivered: each event is
 * recorded once.
 *
 * STUB: not implemented yet.
 */
export class RecordAssignmentHistoryUseCase {
  constructor(private readonly history: AssignmentHistoryRepository) {
    void this.history;
  }

  /** @returns `true` when the event was recorded now, `false` when it had been recorded before. */
  async execute(event: ConversationEvent): Promise<boolean> {
    void event;
    throw new Error('not implemented');
  }
}
