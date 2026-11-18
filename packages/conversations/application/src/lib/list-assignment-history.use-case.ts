import { Page, PageRequest, buildPage } from '@shared/core';
import {
  ConversationNotFoundError,
  IAssignmentHistoryEntity,
  InvalidConversationError,
  isConversationId,
} from 'conversations-domain';
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
 * The conversation must exist in the workspace: that is what keeps another
 * workspace's history unreadable. Everything is validated before the database
 * is read.
 *
 * @throws InvalidConversationError when the id is malformed.
 * @throws InvalidPageRequestError for a bad limit or cursor.
 * @throws ConversationNotFoundError when the conversation is not in the workspace.
 */
export class ListAssignmentHistoryUseCase {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly history: AssignmentHistoryRepository,
  ) {}

  async execute({
    workspaceId,
    conversationId,
    limit,
    next,
    previous,
  }: ListAssignmentHistoryCommand): Promise<Page<IAssignmentHistoryEntity>> {
    if (!isConversationId(conversationId)) {
      throw new InvalidConversationError(
        'id',
        'Conversation id must be 24 lowercase hexadecimal characters',
      );
    }
    const request = PageRequest.create({ limit, next, previous });

    if (!(await this.conversations.findById(workspaceId, conversationId))) {
      throw new ConversationNotFoundError(conversationId);
    }

    const rows = await this.history.list(workspaceId, conversationId, request);
    return buildPage(rows, request);
  }
}
