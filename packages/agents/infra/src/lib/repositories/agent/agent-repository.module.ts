import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AGENT_REPOSITORY, ID_GENERATOR } from 'agents-application';
import { MongooseAgentRepository } from './agent.repository';
import { ObjectIdGenerator } from './object-id-generator';
import { AgentDo, AgentDoSchema } from './schema';

/**
 * Binds the application's agent ports to their MongoDB implementations.
 * Needs a Mongoose connection (`MongooseModule.forRoot*`) in the host app.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: AgentDo.name, schema: AgentDoSchema }])],
  providers: [
    { provide: AGENT_REPOSITORY, useClass: MongooseAgentRepository },
    { provide: ID_GENERATOR, useClass: ObjectIdGenerator },
  ],
  exports: [AGENT_REPOSITORY, ID_GENERATOR],
})
export class AgentRepositoryModule {}
