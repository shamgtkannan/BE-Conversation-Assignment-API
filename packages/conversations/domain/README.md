# conversations-domain

The `Conversation` entity and its rules (`create`, `restore`, `assign`, `unassign`; a closed conversation cannot be assigned), the conversation id check, the `conversation.assigned.v1` event (assignments are the only event) and `assignedEventFromChange`, the rule that turns a conversation's before and after into that event or nothing, the assignment request (`conversation.assignment-requested.v1`), the assignment history line and `historyEntryFromEvent`, and the domain errors.

Conversations are immutable: `assign` and `unassign` return a new conversation with `version` one higher, or the same instance when nothing changes. Imports no framework or database. It may import only `@shared/core`.

## Tests

```sh
npx nx test conversations-domain
```
