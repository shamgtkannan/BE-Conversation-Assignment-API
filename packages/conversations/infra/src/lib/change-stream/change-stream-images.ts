/** The part of a MongoDB `Db` that switching the images on needs. */
export interface ImagesDb {
  command(command: Record<string, unknown>): Promise<unknown>;
}

/**
 * Makes MongoDB keep the document before and after every change to `collection`,
 * so a change stream can report what an update or a replace changed from. Safe to
 * run on every start: switching on what is already on does nothing. A refusal is
 * passed on, so a start without the images does not go unnoticed.
 */
export async function enableChangeStreamImages(db: ImagesDb, collection: string): Promise<void> {
  await db.command({ collMod: collection, changeStreamPreAndPostImages: { enabled: true } });
}
