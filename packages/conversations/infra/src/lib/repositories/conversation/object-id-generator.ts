import { Injectable } from '@nestjs/common';
import { IdGenerator } from 'conversations-application';

/** Generates MongoDB ObjectIds as 24-character hex strings. Not implemented yet. */
@Injectable()
export class ObjectIdGenerator implements IdGenerator {
  next(): string {
    throw new Error('Not implemented');
  }
}
