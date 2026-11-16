import { Conversation, ConversationStatus, IConversationEntity } from 'conversations-domain';
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
 *
 * @throws InvalidConversationError when the subject or status breaks a domain rule.
 */
export class CreateConversationUseCase {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: CreateConversationCommand): Promise<IConversationEntity> {
    // The domain validates before anything is stored.
    const conversation = Conversation.create({
      id: this.ids.next(),
      workspaceId: command.workspaceId,
      subject: command.subject,
      status: command.status,
      now: this.clock.now(),
    });

    await this.conversations.save(conversation);
    return conversation;
  }
}
