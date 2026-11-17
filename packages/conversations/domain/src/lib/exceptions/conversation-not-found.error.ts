/**
 * Thrown when no conversation with the given id exists in the caller's
 * workspace. A conversation that exists in another workspace is reported the
 * same way, so one workspace cannot learn which ids another uses. The API layer
 * maps it to 404.
 */
export class ConversationNotFoundError extends Error {
  constructor(readonly id: string) {
    super(`Conversation ${id} was not found`);
    this.name = 'ConversationNotFoundError';
  }
}
