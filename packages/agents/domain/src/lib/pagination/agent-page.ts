import { IAgentEntity } from '../agent.entity';
import { encodeCursor } from './agent-cursor';
import { PageRequest } from './page-request';

/** One page of agents, newest first, with opaque tokens to move in both directions. */
export interface AgentPage {
  items: IAgentEntity[];
  hasNext: boolean;
  next: string | null;
  hasPrevious: boolean;
  previous: string | null;
}

const tokenFor = (agent: IAgentEntity): string =>
  encodeCursor({ createdAt: agent.createdAt, id: agent.id });

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
export const buildAgentPage = (rows: IAgentEntity[], request: PageRequest): AgentPage => {
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
