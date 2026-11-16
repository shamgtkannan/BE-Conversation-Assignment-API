import { ConversationStatus, IConversationEntity } from 'conversations-domain';
import { Clock, ConversationRepository, IdGenerator } from './ports';

/** Input of {@link CreateConversationUseCase}. */
export interface CreateConversationCommand {
  /** Workspace of the authenticated caller, never taken from the request body. */
  workspaceId: string;
  subject: string;
  /** Defaults to `open`. */
  status?: ConversationStatus;
}

/**
 * Creates an unassigned conversation in the caller's workspace and saves it.
 * Not implemented yet.
 *
 * @throws InvalidConversationError when the subject or status breaks a domain rule.
 */
export class CreateConversationUseCase {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  execute(command: CreateConversationCommand): Promise<IConversationEntity> {
    void command;
    void this.conversations;
    void this.ids;
    void this.clock;
    throw new Error('Not implemented');
  }
}
