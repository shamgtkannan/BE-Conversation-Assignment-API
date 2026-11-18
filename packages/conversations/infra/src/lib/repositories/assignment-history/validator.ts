import * as mongoose from 'mongoose';
import { ASSIGNMENT_ACTIONS } from 'conversations-domain';
import { applyValidator } from '../conversation/validator';

/**
 * The collection validator for `assignment_history`: the rules of a single line
 * that MongoDB itself enforces, whoever writes.
 *
 * - Required fields, types, the allowed actions, no fields beyond the schema.
 * - An "assigned" line names the new agent; an "unassigned" line names the removed
 *   agent and has no new agent. Neither is ever `null`.
 *
 * Keep it in step with {@link AssignmentHistoryDo}; the schema spec checks that.
 */
export const assignmentHistoryValidator: { $jsonSchema: Record<string, unknown> } = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'eventId',
      'workspaceId',
      'conversationId',
      'action',
      'performedBy',
      'createdAt',
      'version',
    ],
    additionalProperties: false,
    properties: {
      _id: { bsonType: 'objectId' },
      eventId: { bsonType: 'string', minLength: 1 },
      workspaceId: { bsonType: 'string', minLength: 1 },
      conversationId: { bsonType: 'string', minLength: 1 },
      action: { bsonType: 'string', enum: [...ASSIGNMENT_ACTIONS] },
      previousAgentId: { bsonType: 'string', minLength: 1 },
      newAgentId: { bsonType: 'string', minLength: 1 },
      performedBy: { bsonType: 'string', minLength: 1 },
      createdAt: { bsonType: 'date' },
      version: { bsonType: 'int', minimum: 1 },
    },
    oneOf: [
      {
        properties: { action: { enum: ['assigned'] } },
        required: ['newAgentId'],
      },
      {
        properties: { action: { enum: ['unassigned'] } },
        required: ['previousAgentId'],
        not: { required: ['newAgentId'] },
      },
    ],
  },
};

/** Applies {@link assignmentHistoryValidator} to the `assignment_history` collection. */
export const ensureAssignmentHistoryValidator = (db: mongoose.mongo.Db): Promise<void> =>
  applyValidator(db, 'assignment_history', assignmentHistoryValidator);
