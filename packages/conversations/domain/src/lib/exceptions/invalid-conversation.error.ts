/** Conversation field that failed a domain rule. */
export type ConversationField = 'subject' | 'status';

/**
 * Thrown when the data given to create a conversation breaks a domain rule
 * (blank subject, unknown status). The API layer maps it to 400.
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
