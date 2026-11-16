import {
  ConversationNotFoundError,
  IConversationEntity,
  InvalidConversationError,
  isConversationId,
} from 'conversations-domain';
import { ConversationRepository } from './ports';

/** Input of {@link GetConversationUseCase}. */
export interface GetConversationCommand {
  /** Workspace of the authenticated caller; only its conversations can be found. */
  workspaceId: string;
  id: string;
}

/**
 * Reads one conversation of the caller's workspace by id.
 *
 * @throws InvalidConversationError when the id is malformed.
 * @throws ConversationNotFoundError when no such conversation exists in the workspace.
 */
export class GetConversationUseCase {
  constructor(private readonly conversations: ConversationRepository) {}

  async execute({ workspaceId, id }: GetConversationCommand): Promise<IConversationEntity> {
    // Check the format first, so a malformed id never reaches the database.
    if (!isConversationId(id)) {
      throw new InvalidConversationError(
        'id',
        'Conversation id must be 24 lowercase hexadecimal characters',
      );
    }
    const conversation = await this.conversations.findById(workspaceId, id);
    if (!conversation) {
      throw new ConversationNotFoundError(id);
    }
    return conversation;
  }
}
