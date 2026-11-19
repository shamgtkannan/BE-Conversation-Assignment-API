# conversations-domain

The `Conversation` entity and its rules (`create`, `restore`, `assign`, `unassign`; a closed conversation cannot be assigned), the conversation id check, the conversation events (`conversation.assigned.v1`, `conversation.unassigned.v1`), the assignment request (`conversation.assignment-requested.v1`), the assignment history line and `historyEntryFromEvent`, and the domain errors.

Conversations are immutable: `assign` and `unassign` return a new conversation with `version` one higher, or the same instance when nothing changes. Imports no framework or database. It may import only `@shared/core`.

## Tests

```sh
npx nx test conversations-domain
```
