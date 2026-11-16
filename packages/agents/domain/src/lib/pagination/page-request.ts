import { AgentCursor } from './agent-cursor';

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
   * tell whether another page exists. Not implemented yet.
   */
  get fetchSize(): number {
    throw new Error('Not implemented');
  }

  /**
   * Validates list parameters. Not implemented yet.
   *
   * @throws {InvalidPageRequestError} for a bad limit, a malformed token, or both tokens.
   */
  static create(input: PageRequestInput): PageRequest {
    void input;
    throw new Error('Not implemented');
  }
}
