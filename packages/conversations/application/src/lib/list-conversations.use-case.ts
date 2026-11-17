import { Page } from '@shared/core';
import { IConversationEntity } from 'conversations-domain';
import { ConversationRepository } from './ports';

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
  constructor(protected readonly conversations: ConversationRepository) {}

  async execute(_command: ListConversationsCommand): Promise<Page<IConversationEntity>> {
    throw new Error('not implemented');
  }
}
