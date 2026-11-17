# agents-application

The agent use cases (`CreateAgentUseCase`, `GetAgentUseCase`, `ListAgentsUseCase`), the ports they need (`AgentRepository`, `IdGenerator`, `Clock`, with their injection tokens) and an in-memory `AgentRepository` for tests.

Plain classes with no Nest decorators. It may import `agents-domain` and `@shared/core`, never Nest or Mongoose.

## Tests

```sh
npx nx test agents-application
```
