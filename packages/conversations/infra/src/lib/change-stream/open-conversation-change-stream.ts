import * as mongoose from 'mongoose';
import { ConversationDo } from '../repositories/conversation/schema';
import { RawChangeStream } from './conversation-change-watcher';

/**
 * Opens a change stream on the conversations collection that reports, for every
 * change, the document after it and the document just before it. It starts from the
 * moment it is opened: changes made earlier are not replayed.
 *
 * STUB: not implemented yet.
 */
export function openConversationChangeStream(
  model: mongoose.Model<ConversationDo>,
): RawChangeStream {
  void model;
  throw new Error('not implemented');
}
