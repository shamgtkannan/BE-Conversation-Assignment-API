/** Conversation field that failed a domain rule. */
export type ConversationField = 'id' | 'subject' | 'status';

/**
 * Thrown when data about a conversation breaks a domain rule (blank subject,
 * unknown status, malformed id). The API layer maps it to 400.
 */
export class InvalidConversationError extends Error {
  constructor(
    readonly field: ConversationField,
    message: string,
  ) {
    super(message);
    this.name = 'InvalidConversationError';
  }
}
