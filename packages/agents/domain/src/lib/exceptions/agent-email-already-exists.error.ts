/**
 * Thrown when an agent with the same email already exists in the workspace.
 * Only the database can know this, so the repository raises it from the
 * unique-index violation. The API layer maps it to 409.
 */
export class AgentEmailAlreadyExistsError extends Error {
  constructor(readonly email: string) {
    super(`An agent with email ${email} already exists in this workspace`);
    this.name = 'AgentEmailAlreadyExistsError';
  }
}
