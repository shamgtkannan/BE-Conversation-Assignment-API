import { ConversationChange, assignedEventFromChange } from 'conversations-domain';
import { EventPublisher } from './ports';

/**
 * Announces what a change to a conversation means for its assignment: when an
 * agent was assigned, it publishes a `conversation.assigned.v1` event; for any
 * other change it publishes nothing.
 *
 * What counts as an assignment is the domain's rule (`assignedEventFromChange`);
 * this use case only hands the result to the publisher. It does not remember what
 * it published: the event's id is the change's id, so a repeat is recognised by
 * whoever receives the event.
 */
export class AnnounceAssignmentUseCase {
  constructor(private readonly events: EventPublisher) {}

  /**
   * @returns `true` when an event was published, `false` when the change was not an assignment.
   * A failure to publish is passed on, so whoever feeds the changes can try again.
   */
  async execute(change: ConversationChange): Promise<boolean> {
    const event = assignedEventFromChange(change);
    if (event === null) {
      return false;
    }
    await this.events.publish(event);
    return true;
  }
}
