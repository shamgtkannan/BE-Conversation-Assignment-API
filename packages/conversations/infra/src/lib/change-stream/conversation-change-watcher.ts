import { Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConversationChange } from 'conversations-domain';
import { RawConversationChange, toConversationChange } from './conversation-change.mapper';

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Watches the conversations in MongoDB and hands every change to a handler, one at
 * a time, in the order they happened.
 *
 * - Starts in the background, so the API starts while MongoDB is not ready; until it
 *   is, it keeps trying.
 * - A change the handler fails on is handed over again after a delay, for as long as
 *   it fails, and nothing behind it is handled meanwhile: the stream stays open and
 *   waits, so nothing is skipped and the order is kept. Only a shutdown ends the retrying.
 * - When the stream fails or closes, a new one is opened after a delay. It starts from
 *   that moment: changes made while no stream was open are not replayed (this watcher
 *   keeps no saved position).
 * - `ready` resolves once the first stream is open, so a change made after it is seen.
 */
export class ConversationChangeWatcher implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ConversationChangeWatcher.name);
  private stopped = false;
  private current?: RawChangeStream;
  private markReady!: () => void;

  /** Resolves once the first stream is open, so a test or a starter can wait for it. */
  readonly ready = new Promise<void>((resolve) => (this.markReady = resolve));

  constructor(
    private readonly open: () => RawChangeStream | Promise<RawChangeStream>,
    private readonly handle: ConversationChangeHandler,
    private readonly options: { retryDelayMs?: number } = {},
  ) {}

  /** Starts in the background: the API must start even when MongoDB is not ready. */
  onModuleInit(): void {
    void this.start();
  }

  /** Opens a stream and handles its changes until shut down, opening a new one when it fails. */
  async start(): Promise<void> {
    const retryDelayMs = this.options.retryDelayMs ?? 5000;
    while (!this.stopped) {
      let stream: RawChangeStream | undefined;
      try {
        stream = await this.open();
        this.current = stream;
        // Opens the stream on the server: from here on, every change is seen.
        const waiting = await stream.tryNext();
        this.markReady();
        if (waiting) await this.handleWithRetry(waiting, retryDelayMs);
        while (!this.stopped) {
          await this.handleWithRetry(await stream.next(), retryDelayMs);
        }
      } catch (error) {
        if (!this.stopped) {
          this.logger.warn(
            `Change stream stopped, opening a new one in ${retryDelayMs} ms: ${String(error)}`,
          );
        }
      } finally {
        this.current = undefined;
        await stream?.close().catch(() => undefined);
      }
      if (!this.stopped) await sleep(retryDelayMs);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    await this.current?.close().catch(() => undefined);
  }

  /** Hands one change over, trying again for as long as the handler fails. */
  private async handleWithRetry(raw: RawConversationChange, retryDelayMs: number): Promise<void> {
    const change = toConversationChange(raw);
    if (change === null) return;
    for (;;) {
      try {
        await this.handle(change);
        return;
      } catch (error) {
        if (this.stopped) return;
        this.logger.warn(
          `Cannot handle change ${change.changeId} yet, trying again in ${retryDelayMs} ms: ${String(error)}`,
        );
        await sleep(retryDelayMs);
        if (this.stopped) return;
      }
    }
  }
}
