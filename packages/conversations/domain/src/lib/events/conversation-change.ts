import { IConversationEntity } from '../conversation.entity';

/**
 * One change to a stored conversation, as the database reports it: the
 * conversation before the change and after it.
 *
 * Pure domain data: it knows nothing about MongoDB, change streams or Kafka. The
 * adapter that watches the database builds it, and {@link assignedEventFromChange}
 * decides what, if anything, the change means.
 */
export interface ConversationChange {
  /**
   * Identifies this change and nothing else, and is the same however many times
   * or by whom the change is seen. The event made from it takes it as its id, so a
   * repeat of the event can be recognised.
   */
  readonly changeId: string;
  /** The conversation as it was before the change. Absent when the change created it. */
  readonly before?: IConversationEntity;
  /** The conversation as it is after the change. */
  readonly after: IConversationEntity;
}
