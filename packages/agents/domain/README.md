# agents-domain

The `Agent` entity and its rules (the name is trimmed and must not be blank; the email is trimmed, lower-cased and must be valid), the agent id check, and the domain errors (`InvalidAgentError`, `AgentNotFoundError`, `AgentEmailAlreadyExistsError`).

Imports no framework or database. It may import only `@shared/core`.

## Tests

```sh
npx nx test agents-domain
```
