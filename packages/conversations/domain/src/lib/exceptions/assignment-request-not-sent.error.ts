/**
 * Thrown when an assignment request passed every check but could not be handed to
 * the message broker, so nobody will carry it out. Nothing was changed; the caller
 * may try again. The API layer maps it to 503. The reason it failed is kept as
 * `cause` for logs, and never shown to the caller.
 */
export class AssignmentRequestNotSentError extends Error {
  constructor(readonly cause?: unknown) {
    super('The assignment request could not be sent, please try again');
    this.name = 'AssignmentRequestNotSentError';
  }
}
