/** Agent field that failed a domain rule. */
export type AgentField = 'id' | 'name' | 'email';

/**
 * Thrown when data about an agent breaks a domain rule (blank name, malformed
 * email, malformed id). The API layer maps it to 400.
 */
export class InvalidAgentError extends Error {
  constructor(
    readonly field: AgentField,
    message: string,
  ) {
    super(message);
    this.name = 'InvalidAgentError';
  }
}
