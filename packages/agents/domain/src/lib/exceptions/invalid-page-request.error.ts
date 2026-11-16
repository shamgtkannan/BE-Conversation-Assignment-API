/** Request parameter that failed validation. */
export type PageRequestField = 'limit' | 'next' | 'previous';

/**
 * Thrown when list parameters are invalid: a limit outside the allowed range,
 * a malformed cursor token, or both cursors at once. The API layer maps it to 400.
 */
export class InvalidPageRequestError extends Error {
  constructor(
    readonly field: PageRequestField,
    message: string,
  ) {
    super(message);
    this.name = 'InvalidPageRequestError';
  }
}
