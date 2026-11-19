import { ConversationChange } from 'conversations-domain';
import { EventPublisher } from './ports';

/**
 * Announces what a change to a conversation means for its assignment: when an
 * agent was assigned, it publishes a `conversation.assigned.v1` event; for any
 * other change it publishes nothing.
 *
 * STUB: not implemented yet.
 */
export class AnnounceAssignmentUseCase {
  constructor(private readonly events: EventPublisher) {
    void this.events;
  }

  /**
   * @returns `true` when an event was published, `false` when the change was not an assignment.
   * A failure to publish is passed on, so whoever feeds the changes can try again.
   */
  async execute(change: ConversationChange): Promise<boolean> {
    void change;
    throw new Error('not implemented');
  }
}
