import { PageRequest } from '@shared/core';
import {
  AssignmentRequested,
  Conversation,
  ConversationEvent,
  ConversationStatus,
  IAssignmentHistoryEntity,
  IConversationEntity,
  NewAssignmentHistoryEntry,
} from 'conversations-domain';

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
   *
   * Pass `expectedVersion` (the version the conversation was read at) when
   * changing an existing conversation: the change is then written only if the
   * stored version still equals it, and the stored version becomes the new
   * conversation's. Omit it for a brand-new conversation.
   *
   * @throws ConversationConcurrentModificationError when `expectedVersion` is no
   * longer the stored version (someone else saved first). Nothing is written.
   */
  save(conversation: Conversation, expectedVersion?: number): Promise<void>;

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

/**
 * Announces what happened to a conversation. Implemented in the outer layers
 * (a message broker, later); the use cases only know this interface.
 */
export interface EventPublisher {
  /** Hands the event over. Resolves once the implementation has accepted it. */
  publish(event: ConversationEvent): Promise<void>;
}
/** Injection token for {@link EventPublisher}. */
export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

/**
 * Storage for assignment history lines. Implemented in `conversations-infra`;
 * the application layer only knows this interface (dependency inversion).
 */
export interface AssignmentHistoryRepository {
  /**
   * Stores a history line. Each event is recorded once: when a line for the same
   * `eventId` already exists, nothing is stored.
   *
   * @returns `true` when the line was stored, `false` when it was already there.
   */
  record(entry: NewAssignmentHistoryEntry): Promise<boolean>;

  /**
   * Reads up to `request.fetchSize` history lines of one conversation of one
   * workspace. Ordering contract (the same as the other lists): newest first by
   * `createdAt`, ties broken by id descending. With a cursor, only rows strictly
   * after it in that order are returned (`next`) or strictly before it
   * (`previous`, returned nearest-first so the caller can reverse them).
   */
  list(
    workspaceId: string,
    conversationId: string,
    request: PageRequest,
  ): Promise<IAssignmentHistoryEntity[]>;
}
/** Injection token for {@link AssignmentHistoryRepository}. */
export const ASSIGNMENT_HISTORY_REPOSITORY = Symbol('ASSIGNMENT_HISTORY_REPOSITORY');

/**
 * Sends a request to change a conversation's assignment to whoever carries it
 * out. Implemented in the outer layers (a message broker); the use case that asks
 * only knows this interface.
 */
export interface AssignmentRequestPublisher {
  /** Hands the request over. Resolves once the implementation has accepted it. */
  publish(request: AssignmentRequested): Promise<void>;
}
/** Injection token for {@link AssignmentRequestPublisher}. */
export const ASSIGNMENT_REQUEST_PUBLISHER = Symbol('ASSIGNMENT_REQUEST_PUBLISHER');
