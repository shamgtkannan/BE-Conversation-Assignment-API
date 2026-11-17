import { Module, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel, MongooseModule } from '@nestjs/mongoose';
import { AGENT_REPOSITORY, ID_GENERATOR } from 'agents-application';
import { MongooseAgentRepository } from './agent.repository';
import { ObjectIdGenerator } from './object-id-generator';
import * as mongoose from 'mongoose';
import { AgentDo, AgentDoSchema } from './schema';
import { ensureAgentValidator } from './validator';

/**
 * Binds the application's agent ports to their MongoDB implementations.
 * Needs a Mongoose connection (`MongooseModule.forRoot*`) in the host app.
 * On start it also sets the collection validator, so MongoDB enforces the
 * single-document rules itself.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: AgentDo.name, schema: AgentDoSchema }])],
  providers: [
    { provide: AGENT_REPOSITORY, useClass: MongooseAgentRepository },
    { provide: ID_GENERATOR, useClass: ObjectIdGenerator },
  ],
  exports: [AGENT_REPOSITORY, ID_GENERATOR],
})
export class AgentRepositoryModule implements OnModuleInit {
  constructor(
    @InjectConnection() private readonly connection: mongoose.Connection,
    @InjectModel(AgentDo.name) private readonly model: mongoose.Model<AgentDo>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.connection.db) throw new Error('MongoDB connection is not ready');
    // Mongoose creates the collection and builds its indexes in the background. MongoDB
    // refuses to change a collection while an index build runs on it, so wait for that first.
    // A failed index build (for example a duplicate email in older data) stops the start
    // here instead of leaving the API running without its unique index.
    await this.model.init();
    await ensureAgentValidator(this.connection.db);
  }
}
