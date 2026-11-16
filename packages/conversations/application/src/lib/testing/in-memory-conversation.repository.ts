import { Conversation } from 'conversations-domain';
import { ConversationRepository } from '../ports';

/**
 * Test double for {@link ConversationRepository}. Like the real one it inserts
 * a new conversation and replaces a stored one with the same id.
 */
export class InMemoryConversationRepository implements ConversationRepository {
  readonly saved: Conversation[] = [];

  async save(conversation: Conversation): Promise<void> {
    const at = this.saved.findIndex((c) => c.id === conversation.id);
    if (at >= 0) {
      this.saved[at] = conversation;
    } else {
      this.saved.push(conversation);
    }
  }
}
