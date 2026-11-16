import {
  InvalidPageRequestError,
  PageRequestField,
} from '../exceptions/invalid-page-request.error';

/**
 * A position in the agent list, which is ordered newest first with the id as
 * tiebreaker. Only the sort keys are kept, never the whole agent.
 */
export interface AgentCursor {
  createdAt: Date;
  id: string;
}

/** Agent ids are 24-character lowercase hex strings (MongoDB ObjectIds). */
const ID_FORMAT = /^[0-9a-f]{24}$/;

/**
 * Turns a position into an opaque, URL-safe token (base64url of a small JSON
 * object). It is not encrypted: callers must treat it as opaque, and the
 * workspace scope is always applied from the auth context, never from the token.
 */
export const encodeCursor = (cursor: AgentCursor): string =>
  Buffer.from(JSON.stringify({ c: cursor.createdAt.toISOString(), i: cursor.id })).toString(
    'base64url',
  );

/**
 * Reads a token produced by {@link encodeCursor}.
 *
 * @param field which request parameter the token came from, for the error.
 * @throws {InvalidPageRequestError} when the token is malformed or tampered with.
 */
export const decodeCursor = (token: string, field: PageRequestField): AgentCursor => {
  const invalid = () => new InvalidPageRequestError(field, `The ${field} cursor is not valid`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    throw invalid();
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw invalid();
  }

  const { c, i } = parsed as { c?: unknown; i?: unknown };
  if (typeof c !== 'string' || typeof i !== 'string' || !ID_FORMAT.test(i)) {
    throw invalid();
  }
  const createdAt = new Date(c);
  // Only accept the exact ISO form we issue, not any string Date happens to parse.
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== c) {
    throw invalid();
  }
  return { createdAt, id: i };
};
