import { Page } from '@shared/core';
import { AssignmentAction, IAssignmentHistoryEntity } from 'conversations-domain';

/**
 * JSON shape of one history line in API responses. The time is an ISO 8601
 * string in UTC. `previousAgentId` and `newAgentId` are always present: `null`
 * when there was no agent before, or none after.
 */
export interface AssignmentHistoryEntryResponse {
  id: string;
  conversationId: string;
  action: AssignmentAction;
  previousAgentId: string | null;
  newAgentId: string | null;
  performedBy: string;
  occurredAt: string;
  version: number;
}

/** JSON shape of `GET /conversations/:id/assignment-history`: one page with opaque tokens. */
export interface AssignmentHistoryPageResponse {
  items: AssignmentHistoryEntryResponse[];
  hasNext: boolean;
  next: string | null;
  hasPrevious: boolean;
  previous: string | null;
}

/**
 * Converts a page of history lines to its response shape.
 *
 * STUB: not implemented yet.
 */
export const toAssignmentHistoryPageResponse = (
  page: Page<IAssignmentHistoryEntity>,
): AssignmentHistoryPageResponse => {
  void page;
  throw new Error('not implemented');
};
