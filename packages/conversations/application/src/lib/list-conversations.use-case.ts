import { Page, PageRequest, buildPage, isEntityId } from '@shared/core';
import {
  CONVERSATION_STATUSES,
  ConversationStatus,
  IConversationEntity,
  InvalidConversationError,
} from 'conversations-domain';
import { ConversationFilter, ConversationRepository } from './ports';

/** Input of {@link ListConversationsUseCase}. */
export interface ListConversationsCommand {
  /** Workspace of the authenticated caller; only its conversations are listed. */
  workspaceId: string;
  /** Only conversations with this status. */
  status?: string;
  /** Only conversations assigned to this agent. */
  assignedAgentId?: string;
  limit?: number;
  next?: string;
  previous?: string;
}

/**
 * Lists a workspace's conversations one page at a time, newest first,
 * optionally filtered by status and assigned agent.
 *
 * @throws InvalidPageRequestError for a bad limit or cursor.
 * @throws InvalidConversationError for an unknown status or a malformed agent id.
 */
export class ListConversationsUseCase {
  constructor(private readonly conversations: ConversationRepository) {}

  async execute({
    workspaceId,
    status,
    assignedAgentId,
    limit,
    next,
    previous,
  }: ListConversationsCommand): Promise<Page<IConversationEntity>> {
    // Validate everything first, so a bad request never reaches the database.
    const filter: ConversationFilter = {};
    if (status !== undefined) {
      if (!(CONVERSATION_STATUSES as readonly string[]).includes(status)) {
        throw new InvalidConversationError(
          'status',
          `Conversation status must be one of: ${CONVERSATION_STATUSES.join(', ')}`,
        );
      }
      filter.status = status as ConversationStatus;
    }
    if (assignedAgentId !== undefined) {
      if (!isEntityId(assignedAgentId)) {
        throw new InvalidConversationError(
          'assignedAgentId',
          'Assigned agent id must be 24 lowercase hexadecimal characters',
        );
      }
      filter.assignedAgentId = assignedAgentId;
    }
    const request = PageRequest.create({ limit, next, previous });

    const rows = await this.conversations.list(workspaceId, filter, request);
    return buildPage(rows, request);
  }
}
