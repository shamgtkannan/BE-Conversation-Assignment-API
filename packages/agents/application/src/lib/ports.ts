import { PageRequest } from '@shared/core';
import { Agent, IAgentEntity } from 'agents-domain';

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

  /**
   * Reads the rows for one page of a workspace's agents, never more than
   * `request.fetchSize`. Ordering contract (see `buildAgentPage`):
   * - `first` and `next`: newest first (`createdAt` then id, both descending);
   *   for `next` only agents strictly older than the cursor.
   * - `previous`: oldest first, only agents strictly newer than the cursor.
   */
  list(workspaceId: string, request: PageRequest): Promise<IAgentEntity[]>;

  /**
   * Finds one agent by id inside a workspace. Resolves to `null` when there is
   * none, including when the id belongs to another workspace. Expects a
   * well-formed id (see `isAgentId`); the use case checks that first.
   */
  findById(workspaceId: string, id: string): Promise<IAgentEntity | null>;
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
