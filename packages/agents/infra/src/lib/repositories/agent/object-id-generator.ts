import { Injectable } from '@nestjs/common';
import { IdGenerator } from 'agents-application';
import * as mongoose from 'mongoose';

/** Generates MongoDB ObjectIds as 24-character hex strings. */
@Injectable()
export class ObjectIdGenerator implements IdGenerator {
  next(): string {
    return new mongoose.Types.ObjectId().toHexString();
  }
}
