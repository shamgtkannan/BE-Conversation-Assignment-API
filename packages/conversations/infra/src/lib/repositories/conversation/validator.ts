import { CONVERSATION_STATUSES } from 'conversations-domain';
import * as mongoose from 'mongoose';

/**
 * The collection validator for `conversations`: the rules of a single document
 * that MongoDB itself enforces, whoever writes (the API, a script, the shell).
 *
 * - The three assignment fields are all present or all absent, and never `null`.
 * - Required fields, types, the allowed statuses, a well-formed agent id.
 * - No fields beyond the schema.
 *
 * Every check is looser than or equal to what the domain already guarantees, so
 * data written through the application always passes. Rules that need other
 * data (the agent exists, the workspace matches, the conversation is open) cannot
 * be expressed here and stay in the use cases.
 *
 * Keep it in step with {@link ConversationDo}; the schema spec checks that.
 */
export const conversationValidator: { $jsonSchema: Record<string, unknown> } = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['workspaceId', 'subject', 'status', 'createdAt', 'updatedAt'],
    additionalProperties: false,
    properties: {
      _id: { bsonType: 'objectId' },
      workspaceId: { bsonType: 'string', minLength: 1 },
      // `\S`: at least one character that is not whitespace.
      subject: { bsonType: 'string', pattern: '\\S' },
      status: { bsonType: 'string', enum: [...CONVERSATION_STATUSES] },
      assignedAgentId: { bsonType: 'string', pattern: '^[0-9a-f]{24}$' },
      assignedAt: { bsonType: 'date' },
      assignedBy: { bsonType: 'string', minLength: 1 },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
    // If any assignment field is present, the other two must be too.
    dependencies: {
      assignedAgentId: ['assignedAt', 'assignedBy'],
      assignedAt: ['assignedAgentId', 'assignedBy'],
      assignedBy: ['assignedAgentId', 'assignedAt'],
    },
  },
};

/** MongoDB's "namespace already exists" error code. */
const NAMESPACE_EXISTS = 48;

/**
 * Makes sure `collection` has `validator`: creates the collection with it, or
 * sets it on a collection that already exists. Safe to run on every start.
 *
 * Validation level is `moderate`: new documents are always checked, and so are
 * updates to documents that already pass. Documents stored before the validator
 * existed are not rejected, and can still be read and updated.
 */
export const applyValidator = async (
  db: mongoose.mongo.Db,
  collection: string,
  validator: Record<string, unknown>,
): Promise<void> => {
  const options = { validator, validationLevel: 'moderate', validationAction: 'error' } as const;
  try {
    await db.createCollection(collection, options);
  } catch (error) {
    if ((error as { code?: number }).code !== NAMESPACE_EXISTS) throw error;
    await db.command({ collMod: collection, ...options });
  }
};

/** Applies {@link conversationValidator} to the `conversations` collection. */
export const ensureConversationValidator = (db: mongoose.mongo.Db): Promise<void> =>
  applyValidator(db, 'conversations', conversationValidator);
