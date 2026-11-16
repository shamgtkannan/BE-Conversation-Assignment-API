/**
 * A support agent who can be assigned to conversations.
 *
 * Pure domain interface:
 * MongoDB persistence model in `agents-infra` implements this interface.
 */
export interface IAgentEntity {
  /** Identifier as a string (an ObjectId hex string in the current persistence). */
  id: string;
  /** Workspace the agent belongs to. Always taken from the auth context, never the request body. */
  workspaceId: string;
  name: string;
  /** Unique within a workspace. Stored trimmed and lowercased. */
  email: string;
  /** Creation time, UTC. */
  createdAt: Date;
  /** Last modification time, UTC. Equals `createdAt` until the first change. */
  updatedAt: Date;
}
