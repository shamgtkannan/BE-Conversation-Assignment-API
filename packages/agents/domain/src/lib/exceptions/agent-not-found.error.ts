/**
 * Thrown when no agent with the given id exists in the caller's workspace.
 * An agent that exists in another workspace is reported the same way, so one
 * workspace cannot learn which ids another uses. The API layer maps it to 404.
 */
export class AgentNotFoundError extends Error {
  constructor(readonly id: string) {
    super(`Agent ${id} was not found`);
    this.name = 'AgentNotFoundError';
  }
}
