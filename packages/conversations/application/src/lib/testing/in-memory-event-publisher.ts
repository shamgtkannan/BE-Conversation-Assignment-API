import { ConversationEvent } from 'conversations-domain';
import { EventPublisher } from '../ports';

/** Test double for {@link EventPublisher}: remembers every event, in order. */
export class InMemoryEventPublisher implements EventPublisher {
  readonly published: ConversationEvent[] = [];

  async publish(event: ConversationEvent): Promise<void> {
    this.published.push(event);
  }
}
