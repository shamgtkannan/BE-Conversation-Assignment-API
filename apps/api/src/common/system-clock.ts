import { Clock } from 'agents-application';

/** Real clock. Dates are absolute instants; they serialise as UTC (ISO 8601). */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
