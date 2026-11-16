import { PageRequestField } from '../exceptions/invalid-page-request.error';

/**
 * A position in the agent list, which is ordered newest first with the id as
 * tiebreaker. Only the sort keys are kept, never the whole agent.
 */
export interface AgentCursor {
  createdAt: Date;
  id: string;
}

/** Turns a position into an opaque, URL-safe token. Not implemented yet. */
export const encodeCursor = (cursor: AgentCursor): string => {
  void cursor;
  throw new Error('Not implemented');
};

/**
 * Reads a token produced by {@link encodeCursor}. Not implemented yet.
 *
 * @param field which request parameter the token came from, for the error.
 * @throws {InvalidPageRequestError} when the token is malformed or tampered with.
 */
export const decodeCursor = (token: string, field: PageRequestField): AgentCursor => {
  void token;
  void field;
  throw new Error('Not implemented');
};
