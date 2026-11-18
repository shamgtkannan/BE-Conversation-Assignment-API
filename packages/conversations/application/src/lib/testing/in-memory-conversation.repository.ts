import { PageRequest } from '@shared/core';
import {
  Conversation,
  ConversationConcurrentModificationError,
  IConversationEntity,
} from 'conversations-domain';
import { ConversationFilter, ConversationRepository } from '../ports';

/** List order: newest first, the id breaks ties. */
const newestFirst = (a: IConversationEntity, b: IConversationEntity): number =>
  b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/**
 * Test double for {@link ConversationRepository}. Like the real one it inserts
 * a new conversation, replaces a stored one with the same id, and finds a
 * conversation only inside its own workspace.
 */
export class InMemoryConversationRepository implements ConversationRepository {
  readonly saved: Conversation[] = [];

  async save(conversation: Conversation, expectedVersion?: number): Promise<void> {
    const at = this.saved.findIndex((c) => c.id === conversation.id);
    // Like the real one: a versioned save only goes through if nobody saved since the read.
    if (expectedVersion !== undefined && this.saved[at]?.version !== expectedVersion) {
      throw new ConversationConcurrentModificationError(conversation.id);
    }
    if (at >= 0) {
      this.saved[at] = conversation;
    } else {
      this.saved.push(conversation);
    }
  }

  async findById(workspaceId: string, id: string): Promise<IConversationEntity | null> {
    return this.saved.find((c) => c.workspaceId === workspaceId && c.id === id) ?? null;
  }

  async list(
    workspaceId: string,
    filter: ConversationFilter,
    request: PageRequest,
  ): Promise<IConversationEntity[]> {
    const ordered = this.saved
      .filter(
        (c) =>
          c.workspaceId === workspaceId &&
          (filter.status === undefined || c.status === filter.status) &&
          (filter.assignedAgentId === undefined || c.assignedAgentId === filter.assignedAgentId),
      )
      .sort(newestFirst);
    const { cursor, direction } = request;

    if (direction === 'previous' && cursor) {
      const newer = ordered.filter(
        (c) =>
          c.createdAt.getTime() > cursor.createdAt.getTime() ||
          (c.createdAt.getTime() === cursor.createdAt.getTime() && c.id > cursor.id),
      );
      return newer.reverse().slice(0, request.fetchSize);
    }
    const rows =
      direction === 'next' && cursor
        ? ordered.filter(
            (c) =>
              c.createdAt.getTime() < cursor.createdAt.getTime() ||
              (c.createdAt.getTime() === cursor.createdAt.getTime() && c.id < cursor.id),
          )
        : ordered;
    return rows.slice(0, request.fetchSize);
  }
}
