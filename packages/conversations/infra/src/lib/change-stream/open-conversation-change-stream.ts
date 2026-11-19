import * as mongoose from 'mongoose';
import { ConversationDo } from '../repositories/conversation/schema';
import { RawChangeStream } from './conversation-change-watcher';

/**
 * Opens a change stream on the conversations collection that reports, for every
 * change, the document after it and the document just before it. It starts from the
 * moment it is opened: changes made earlier are not replayed.
 *
 * `required` makes MongoDB fail the stream, loudly, if the images were not switched
 * on for the collection, instead of reporting changes without what they changed from.
 *
 * @throws Error when the connection is not ready yet; the watcher tries again.
 */
export function openConversationChangeStream(
  model: mongoose.Model<ConversationDo>,
): RawChangeStream {
  const db = model.db.db;
  if (!db) {
    throw new Error('MongoDB connection is not ready');
  }
  return db
    .collection(model.collection.collectionName)
    .watch([], {
      fullDocument: 'required',
      fullDocumentBeforeChange: 'required',
    }) as unknown as RawChangeStream;
}
