import * as mongoose from 'mongoose';

/**
 * The collection validator for `agents`: the rules of a single document that
 * MongoDB itself enforces, whoever writes (the API, a script, the shell).
 *
 * - Required fields, types, a non-blank name, a non-empty workspace.
 * - The email contains an `@` and no capital letters. The domain lower-cases it
 *   before saving, so this also closes the gap where a direct write could store
 *   the same address in another case and slip past the unique index.
 * - No fields beyond the schema.
 *
 * Every check is looser than or equal to what the domain already guarantees, so
 * data written through the application always passes. The unique
 * `{ workspaceId, email }` index is a separate rule and lives on the schema.
 *
 * Keep it in step with {@link AgentDo}; the schema spec checks that.
 */
export const agentValidator: { $jsonSchema: Record<string, unknown> } = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['workspaceId', 'name', 'email', 'createdAt', 'updatedAt'],
    additionalProperties: false,
    properties: {
      _id: { bsonType: 'objectId' },
      workspaceId: { bsonType: 'string', minLength: 1 },
      // `\S`: at least one character that is not whitespace.
      name: { bsonType: 'string', pattern: '\\S' },
      email: { bsonType: 'string', pattern: '^[^A-Z]+@[^A-Z]+$' },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
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

/** Applies {@link agentValidator} to the `agents` collection. */
export const ensureAgentValidator = (db: mongoose.mongo.Db): Promise<void> =>
  applyValidator(db, 'agents', agentValidator);
