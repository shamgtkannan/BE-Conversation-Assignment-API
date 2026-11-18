import { Module, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel, MongooseModule } from '@nestjs/mongoose';
import { ASSIGNMENT_HISTORY_REPOSITORY } from 'conversations-application';
import * as mongoose from 'mongoose';
import { MongooseAssignmentHistoryRepository } from './assignment-history.repository';
import { AssignmentHistoryDo, AssignmentHistoryDoSchema } from './schema';
import { ensureAssignmentHistoryValidator } from './validator';

/**
 * Binds the application's assignment-history port to its MongoDB implementation.
 * Needs a Mongoose connection (`MongooseModule.forRoot*`) in the host app.
 * On start it also builds the indexes and sets the collection validator, so
 * MongoDB enforces the single-line rules itself.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AssignmentHistoryDo.name, schema: AssignmentHistoryDoSchema },
    ]),
  ],
  providers: [
    { provide: ASSIGNMENT_HISTORY_REPOSITORY, useClass: MongooseAssignmentHistoryRepository },
  ],
  exports: [ASSIGNMENT_HISTORY_REPOSITORY],
})
export class AssignmentHistoryRepositoryModule implements OnModuleInit {
  constructor(
    @InjectConnection() private readonly connection: mongoose.Connection,
    @InjectModel(AssignmentHistoryDo.name)
    private readonly model: mongoose.Model<AssignmentHistoryDo>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.connection.db) throw new Error('MongoDB connection is not ready');
    // MongoDB refuses to change a collection while an index build runs on it: wait first.
    await this.model.init();
    await ensureAssignmentHistoryValidator(this.connection.db);
  }
}
