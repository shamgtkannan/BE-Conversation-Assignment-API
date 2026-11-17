import { Clock as AgentsClock } from 'agents-application';
import { Clock as ConversationsClock } from 'conversations-application';

/**
 * Real clock, shared by both contexts through their own `Clock` ports (the
 * contexts cannot import each other, so each declares its own). Dates are
 * absolute instants; they serialise as UTC (ISO 8601).
 */
export class SystemClock implements AgentsClock, ConversationsClock {
  now(): Date {
    return new Date();
  }
}
