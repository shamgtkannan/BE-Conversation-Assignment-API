import { InvalidPageRequestError } from '../exceptions/invalid-page-request.error';
import { AgentCursor, decodeCursor } from './agent-cursor';

/** Page size used when the caller gives none. */
export const DEFAULT_LIMIT = 20;
/** Largest page a caller may ask for. */
export const MAX_LIMIT = 100;

/**
 * Which way to read from the cursor:
 * - `first`: no cursor, start at the newest agent.
 * - `next`: agents older than the cursor.
 * - `previous`: agents newer than the cursor.
 */
export type PageDirection = 'first' | 'next' | 'previous';

/** Raw, unvalidated list parameters as they arrive from a caller. */
export interface PageRequestInput {
  limit?: number;
  next?: string;
  previous?: string;
}

/** Validated list parameters. Created only through {@link PageRequest.create}. */
export class PageRequest {
  private constructor(
    readonly limit: number,
    readonly direction: PageDirection,
    readonly cursor: AgentCursor | undefined,
  ) {}

  /**
   * How many rows a repository should fetch: one extra, so the page builder can
   * tell whether another page exists.
   */
  get fetchSize(): number {
    return this.limit + 1;
  }

  /**
   * Validates list parameters.
   *
   * @throws {InvalidPageRequestError} for a bad limit, a malformed token, or both tokens.
   */
  static create({ limit = DEFAULT_LIMIT, next, previous }: PageRequestInput): PageRequest {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new InvalidPageRequestError('limit', `limit must be a whole number from 1 to ${MAX_LIMIT}`);
    }
    if (next !== undefined && previous !== undefined) {
      throw new InvalidPageRequestError('previous', 'Send either next or previous, not both');
    }
    if (next !== undefined) {
      return new PageRequest(limit, 'next', decodeCursor(next, 'next'));
    }
    if (previous !== undefined) {
      return new PageRequest(limit, 'previous', decodeCursor(previous, 'previous'));
    }
    return new PageRequest(limit, 'first', undefined);
  }
}
