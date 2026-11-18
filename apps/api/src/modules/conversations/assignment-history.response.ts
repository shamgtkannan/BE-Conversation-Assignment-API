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
 * Converts a history line to its response shape. Listing every field keeps stray
 * properties (the event id, the workspace) off the wire, and turns the domain's
 * "absent" agent fields into the explicit `null` the API contract promises.
 */
export const toAssignmentHistoryEntryResponse = (
  entry: IAssignmentHistoryEntity,
): AssignmentHistoryEntryResponse => ({
  id: entry.id,
  conversationId: entry.conversationId,
  action: entry.action,
  previousAgentId: entry.previousAgentId ?? null,
  newAgentId: entry.newAgentId ?? null,
  performedBy: entry.performedBy,
  occurredAt: entry.createdAt.toISOString(),
  version: entry.version,
});

/** Converts a page of history lines to its response shape. */
export const toAssignmentHistoryPageResponse = (
  page: Page<IAssignmentHistoryEntity>,
): AssignmentHistoryPageResponse => ({
  items: page.items.map(toAssignmentHistoryEntryResponse),
  hasNext: page.hasNext,
  next: page.next,
  hasPrevious: page.hasPrevious,
  previous: page.previous,
});
