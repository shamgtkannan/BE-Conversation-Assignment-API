# conversations-infra

The MongoDB side of conversations: the `ConversationDo` Mongoose schema with its indexes, `MongooseConversationRepository`, `ObjectIdGenerator` and `ConversationRepositoryModule`, which binds them to the application ports.

It may import `conversations-application`, `conversations-domain` and `@shared/core`.

## Tests

```sh
npx nx test conversations-infra
```

The integration tests use a real MongoDB (start it with `docker compose up -d --wait`):

```sh
npx nx integration conversations-infra
```
