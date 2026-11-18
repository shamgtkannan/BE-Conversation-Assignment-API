# conversations-infra

The MongoDB and Kafka sides of conversations: the `ConversationDo` Mongoose schema with its indexes, `MongooseConversationRepository`, `ObjectIdGenerator` and `ConversationRepositoryModule`, which binds them to the application ports. For events it holds `KafkaEventPublisher` (the `EventPublisher` port over a Kafka producer: topic = event type, key = conversation id, JSON value) and `ensureTopics`.

It may import `conversations-application`, `conversations-domain` and `@shared/core`.

## Tests

```sh
npx nx test conversations-infra
```

The integration tests use a real MongoDB and Kafka (start them with `docker compose up -d --wait`):

```sh
npx nx integration conversations-infra
```
