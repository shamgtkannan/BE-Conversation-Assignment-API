import { Conversation, IConversationEntity } from 'conversations-domain';

/**
 * Storage for conversations. Implemented in `conversations-infra`; the
 * application layer only knows this interface (dependency inversion).
 */
export interface ConversationRepository {
  /**
   * Persists a conversation by its id: inserts it when new, otherwise replaces
   * the stored one. Replacing is what lets later changes (an assignment, say)
   * reuse this method.
   */
  save(conversation: Conversation): Promise<void>;

  /**
   * Finds one conversation by id inside a workspace. Resolves to `null` when
   * there is none, including when the id belongs to another workspace. Expects
   * a well-formed id (see `isConversationId`); the use case checks that first.
   */
  findById(workspaceId: string, id: string): Promise<IConversationEntity | null>;
}
/** Injection token for {@link ConversationRepository}. */
export const CONVERSATION_REPOSITORY = Symbol('CONVERSATION_REPOSITORY');

/** Produces identifiers for new conversations. */
export interface IdGenerator {
  next(): string;
}
/** Injection token for {@link IdGenerator}. */
export const ID_GENERATOR = Symbol('ID_GENERATOR');

/** Source of the current time, so tests control it. */
export interface Clock {
  now(): Date;
}
/** Injection token for {@link Clock}. */
export const CLOCK = Symbol('CLOCK');
