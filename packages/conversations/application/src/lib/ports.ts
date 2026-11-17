import { PageRequest } from '@shared/core';
import { Conversation, ConversationStatus, IConversationEntity } from 'conversations-domain';

/** Optional filters of the conversation list; both combine with AND. */
export interface ConversationFilter {
  status?: ConversationStatus;
  assignedAgentId?: string;
}

/**
 * Storage for conversations. Implemented in `conversations-infra`; the
 * application layer only knows this interface (dependency inversion).
 */
export interface ConversationRepository {
  /**
   * Persists a conversation by its id: inserts it when new, otherwise replaces
   * the stored one. Replacing is what lets later changes (an assignment, say)
   * reuse this method.
   */
  save(conversation: Conversation): Promise<void>;

  /**
   * Finds one conversation by id inside a workspace. Resolves to `null` when
   * there is none, including when the id belongs to another workspace. Expects
   * a well-formed id (see `isConversationId`); the use case checks that first.
   */
  findById(workspaceId: string, id: string): Promise<IConversationEntity | null>;

  /**
   * Reads up to `request.fetchSize` conversations of one workspace that match
   * `filter`. Ordering contract (the same as the agents list): newest first by
   * `createdAt`, ties broken by id descending. With a cursor, only rows strictly
   * after it in that order are returned (`next`) or strictly before it
   * (`previous`, returned nearest-first so the caller can reverse them).
   */
  list(
    workspaceId: string,
    filter: ConversationFilter,
    request: PageRequest,
  ): Promise<IConversationEntity[]>;
}
/** Injection token for {@link ConversationRepository}. */
export const CONVERSATION_REPOSITORY = Symbol('CONVERSATION_REPOSITORY');

/** Produces identifiers for new conversations. */
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

/**
 * Asks the agents side whether an agent exists. Conversations never import the
 * agents context; the API wires an adapter that answers from it.
 */
export interface AgentLookup {
  /** True when `agentId` is an agent of `workspaceId`. Other workspaces count as no. */
  exists(workspaceId: string, agentId: string): Promise<boolean>;
}
/** Injection token for {@link AgentLookup}. */
export const AGENT_LOOKUP = Symbol('AGENT_LOOKUP');
