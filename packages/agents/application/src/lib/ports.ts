import { Agent } from 'agents-domain';

/**
 * Storage for agents. Implemented in `agents-infra`; the application layer only
 * knows this interface (dependency inversion).
 */
export interface AgentRepository {
  /**
   * Persists a newly created agent.
   *
   * @throws AgentEmailAlreadyExistsError when the email is already used in the
   *   agent's workspace.
   */
  save(agent: Agent): Promise<void>;
}
/** Injection token for {@link AgentRepository}. */
export const AGENT_REPOSITORY = Symbol('AGENT_REPOSITORY');

/** Produces identifiers for new agents. */
export interface IdGenerator {
  next(): string;
}
/** Injection token for {@link IdGenerator}. */
export const ID_GENERATOR = Symbol('ID_GENERATOR');

/** Source of the current time, so tests control it. */
export interface Clock {
  now(): Date;
}
/** Injection token for {@link Clock}. */
export const CLOCK = Symbol('CLOCK');
