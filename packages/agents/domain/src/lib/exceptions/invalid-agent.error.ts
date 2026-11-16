/** Agent field that failed a domain rule. */
export type AgentField = 'name' | 'email';

/**
 * Thrown when the data given to create an agent breaks a domain rule
 * (blank name, malformed email). The API layer maps it to 400.
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
