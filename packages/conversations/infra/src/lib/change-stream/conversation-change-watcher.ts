import { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConversationChange } from 'conversations-domain';
import { RawConversationChange } from './conversation-change.mapper';

/** The part of a MongoDB change stream the watcher uses; the driver's `ChangeStream` satisfies it. */
export interface RawChangeStream {
  /** Resolves with the next change if there is one right now, or `null`. Opens the stream if it is not open yet. */
  tryNext(): Promise<RawConversationChange | null>;
  /** Waits for the next change. Rejects when the stream fails or is closed. */
  next(): Promise<RawConversationChange>;
  close(): Promise<void>;
}

/** What the watcher hands each change to. */
export type ConversationChangeHandler = (change: ConversationChange) => Promise<unknown>;

/**
 * Watches the conversations in MongoDB and hands every change to a handler, one at
 * a time, in the order they happened.
 *
 * STUB: nothing is watched yet.
 */
export class ConversationChangeWatcher implements OnModuleInit, OnApplicationShutdown {
  /** Resolves once the first stream is open, so a test or a starter can wait for it. */
  readonly ready: Promise<void> = Promise.resolve();

  constructor(
    private readonly open: () => RawChangeStream | Promise<RawChangeStream>,
    private readonly handle: ConversationChangeHandler,
    private readonly options: { retryDelayMs?: number } = {},
  ) {
    void this.open;
    void this.handle;
    void this.options;
  }

  /** Starts in the background: the API must start even when MongoDB is not ready. */
  onModuleInit(): void {
    // STUB
  }

  /** Opens a stream and handles its changes until shut down, opening a new one when it fails. */
  async start(): Promise<void> {
    // STUB
  }

  async onApplicationShutdown(): Promise<void> {
    // STUB
  }
}
