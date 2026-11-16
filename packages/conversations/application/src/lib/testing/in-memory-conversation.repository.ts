import { Conversation, IConversationEntity } from 'conversations-domain';
import { ConversationRepository } from '../ports';

/**
 * Test double for {@link ConversationRepository}. Like the real one it inserts
 * a new conversation, replaces a stored one with the same id, and finds a
 * conversation only inside its own workspace.
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

  async findById(workspaceId: string, id: string): Promise<IConversationEntity | null> {
    return this.saved.find((c) => c.workspaceId === workspaceId && c.id === id) ?? null;
  }
}
