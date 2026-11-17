# agents-infra

The MongoDB side of agents: the `AgentDo` Mongoose schema with its indexes (including the unique `{ workspaceId, email }`), `MongooseAgentRepository`, `ObjectIdGenerator` and `AgentRepositoryModule`, which binds them to the application ports.

It may import `agents-application`, `agents-domain` and `@shared/core`.

## Tests

```sh
npx nx test agents-infra
```

The integration tests use a real MongoDB (start it with `docker compose up -d --wait`):

```sh
npx nx integration agents-infra
```
