/**
 * Thrown when a conversation was changed by someone else between reading it and
 * saving the change, so the save was refused. Nothing was written; the caller
 * may read the conversation again and retry. The API layer maps it to 409.
 */
export class ConversationConcurrentModificationError extends Error {
  constructor(readonly id: string) {
    super(`Conversation ${id} was changed by another request, please retry`);
    this.name = 'ConversationConcurrentModificationError';
  }
}
