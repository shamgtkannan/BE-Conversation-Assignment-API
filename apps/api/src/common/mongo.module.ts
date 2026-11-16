import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import * as os from 'os';

/**
 * The application's single MongoDB connection, built from environment variables.
 *
 * `MONGODB_HOSTS`, `MONGODB_DATABASE` and `MONGODB_REPLICA_SET` identify the
 * database, so they have no defaults and the app refuses to start without them.
 * `MONGODB_POOL_SIZE` is operational and defaults to 10.
 */
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: `mongodb://${config.getOrThrow<string>('MONGODB_HOSTS')}`,
        dbName: config.getOrThrow<string>('MONGODB_DATABASE'),
        replicaSet: config.getOrThrow<string>('MONGODB_REPLICA_SET'),
        maxPoolSize: Number(config.get('MONGODB_POOL_SIZE') ?? 10),
        writeConcern: { w: 'majority' as const, wtimeout: 3000 },
        // Fail fast with a clear error when MongoDB is not running.
        serverSelectionTimeoutMS: 5000,
        // The driver loads `os` with a dynamic import, which Jest's CommonJS runtime
        // cannot do; without this the server rejects the empty client handshake.
        runtimeAdapters: { os },
      }),
    }),
  ],
})
export class MongoModule {}
