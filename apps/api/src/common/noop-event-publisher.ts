import { EventPublisher } from 'conversations-application';

/**
 * Accepts events and drops them. A stand-in so the app runs before a message
 * broker is connected; replace it with the broker adapter rather than keeping
 * it as a fallback, or events would vanish silently.
 */
export class NoopEventPublisher implements EventPublisher {
  async publish(): Promise<void> {
    // Nothing to do on purpose.
  }
}
