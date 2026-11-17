/**
 * Thrown when someone tries to assign an agent to a closed conversation. The
 * API layer maps it to 409.
 */
export class ConversationClosedError extends Error {
  constructor(readonly id: string) {
    super(`Conversation ${id} is closed and cannot be assigned`);
    this.name = 'ConversationClosedError';
  }
}
