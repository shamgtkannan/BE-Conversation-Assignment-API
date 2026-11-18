import { IAssignmentHistoryEntity } from 'conversations-domain';
import { Page } from '@shared/core';
import { AssignmentHistoryRepository, ConversationRepository } from './ports';

/** Input of {@link ListAssignmentHistoryUseCase}. */
export interface ListAssignmentHistoryCommand {
  /** Workspace of the authenticated caller. */
  workspaceId: string;
  conversationId: string;
  limit?: number;
  next?: string;
  previous?: string;
}

/**
 * Lists the assignment history of one conversation of the caller's workspace,
 * newest first, one page at a time.
 *
 * STUB: not implemented yet.
 */
export class ListAssignmentHistoryUseCase {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly history: AssignmentHistoryRepository,
  ) {
    void this.conversations;
    void this.history;
  }

  async execute(command: ListAssignmentHistoryCommand): Promise<Page<IAssignmentHistoryEntity>> {
    void command;
    throw new Error('not implemented');
  }
}
