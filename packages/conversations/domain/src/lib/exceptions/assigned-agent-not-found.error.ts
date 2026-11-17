/**
 * Thrown when the agent to assign does not exist in the caller's workspace. An
 * agent of another workspace is reported the same way. The API layer maps it
 * to 404.
 */
export class AssignedAgentNotFoundError extends Error {
  constructor(readonly agentId: string) {
    super(`Agent ${agentId} was not found`);
    this.name = 'AssignedAgentNotFoundError';
  }
}
