import { RequestAssignmentResult } from 'conversations-application';

/**
 * JSON shape of the answer to `PATCH` and `DELETE /conversations/:id/assignment`.
 *
 * The change has been asked for, not made: it is carried out a moment later, so the
 * answer names the request and does not describe the conversation. Read the
 * conversation, or its assignment history, to see the result.
 */
export interface AssignmentRequestedResponse {
  /** Names the request that was sent. */
  commandId: string;
  status: 'requested';
}

/** Converts the use case's answer to its response shape. */
export const toAssignmentRequestedResponse = (
  result: RequestAssignmentResult,
): AssignmentRequestedResponse => ({ commandId: result.commandId, status: 'requested' });
