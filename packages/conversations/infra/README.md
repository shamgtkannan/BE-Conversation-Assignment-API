# conversations-infra

The MongoDB and Kafka sides of conversations: the `ConversationDo` Mongoose schema with its indexes, `MongooseConversationRepository`, `ObjectIdGenerator` and `ConversationRepositoryModule`, which binds them to the application ports. For events it holds `KafkaEventPublisher` (the `EventPublisher` port over a Kafka producer: topic = event type, key = conversation id, JSON value), `KafkaAssignmentRequestPublisher` (the same for assignment requests), `decodeConversationEvent` and `decodeAssignmentRequest` (the reverse, used by the consumers), `ensureTopics`, and the change stream: `ConversationChangeWatcher` (reads MongoDB's change stream in order, retries a change until it is handled, reopens a failed stream), `toConversationChange`, `openConversationChangeStream` and `enableChangeStreamImages`, and the assignment-history schema, validator and repository.

It may import `conversations-application`, `conversations-domain` and `@shared/core`.

## Tests

```sh
npx nx test conversations-infra
```

The integration tests use a real MongoDB and Kafka (start them with `docker compose up -d --wait`):

```sh
npx nx integration conversations-infra
```
