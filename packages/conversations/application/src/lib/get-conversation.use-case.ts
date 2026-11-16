import { IConversationEntity } from 'conversations-domain';
import { ConversationRepository } from './ports';

/** Input of {@link GetConversationUseCase}. */
export interface GetConversationCommand {
  /** Workspace of the authenticated caller; only its conversations can be found. */
  workspaceId: string;
  id: string;
}

/**
 * Reads one conversation of the caller's workspace by id. Not implemented yet.
 *
 * @throws InvalidConversationError when the id is malformed.
 * @throws ConversationNotFoundError when no such conversation exists in the workspace.
 */
export class GetConversationUseCase {
  constructor(private readonly conversations: ConversationRepository) {}

  execute(command: GetConversationCommand): Promise<IConversationEntity> {
    void command;
    void this.conversations;
    throw new Error('Not implemented');
  }
}
