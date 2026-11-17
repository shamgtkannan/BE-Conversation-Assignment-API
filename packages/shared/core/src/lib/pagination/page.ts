import { encodeCursor } from './cursor';
import { PageRequest } from './page-request';

/** What a page needs of its items: an id and a creation time, the two sort keys. */
export interface Pageable {
  id: string;
  createdAt: Date;
}

/** One page of items, newest first, with opaque tokens to move in both directions. */
export interface Page<T extends Pageable> {
  items: T[];
  hasNext: boolean;
  next: string | null;
  hasPrevious: boolean;
  previous: string | null;
}

const tokenFor = (item: Pageable): string =>
  encodeCursor({ createdAt: item.createdAt, id: item.id });

/**
 * Builds a page from the rows a repository fetched with `request.fetchSize`.
 *
 * Repository contract: for `first` and `next` the rows are in list order (newest
 * first); for `previous` they are in reverse (oldest first, starting next to the
 * cursor). Either way there may be one row more than `request.limit`.
 *
 * The extra row only signals that more exist beyond this page; it is dropped.
 * Moving in a direction implies the opposite direction has rows (the cursor
 * itself), so `hasPrevious` after `next` and `hasNext` after `previous` are true.
 */
export const buildPage = <T extends Pageable>(rows: T[], request: PageRequest): Page<T> => {
  const hasMoreBeyond = rows.length > request.limit;
  const kept = rows.slice(0, request.limit);
  const movingBack = request.direction === 'previous';
  const items = movingBack ? kept.reverse() : kept;

  if (items.length === 0) {
    return { items, hasNext: false, next: null, hasPrevious: false, previous: null };
  }

  const hasNext = movingBack ? true : hasMoreBeyond;
  const hasPrevious = movingBack ? hasMoreBeyond : request.direction === 'next';

  return {
    items,
    hasNext,
    next: hasNext ? tokenFor(items[items.length - 1]) : null,
    hasPrevious,
    previous: hasPrevious ? tokenFor(items[0]) : null,
  };
};
