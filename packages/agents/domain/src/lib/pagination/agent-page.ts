import { IAgentEntity } from '../agent.entity';
import { PageRequest } from './page-request';

/** One page of agents, newest first, with opaque tokens to move in both directions. */
export interface AgentPage {
  items: IAgentEntity[];
  hasNext: boolean;
  next: string | null;
  hasPrevious: boolean;
  previous: string | null;
}

/**
 * Builds a page from the rows a repository fetched with `request.fetchSize`.
 * Not implemented yet.
 *
 * Repository contract: for `first` and `next` the rows are in list order (newest
 * first); for `previous` they are in reverse (oldest first, starting next to the
 * cursor). Either way there may be one row more than `request.limit`.
 */
export const buildAgentPage = (rows: IAgentEntity[], request: PageRequest): AgentPage => {
  void rows;
  void request;
  throw new Error('Not implemented');
};
