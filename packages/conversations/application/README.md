# conversations-application

The conversation use cases (create, get, list, assign, unassign, request an assignment, record and list assignment history), the ports they need (`ConversationRepository`, `AgentLookup`, `EventPublisher`, `AssignmentRequestPublisher`, `AssignmentHistoryRepository`, `IdGenerator`, `Clock`, with their injection tokens), the `ASSIGNING_ROLES` rule and in-memory test doubles.

Plain classes with no Nest decorators. `assign` and `unassign` save with the version they read (a clash throws `ConversationConcurrentModificationError`) and then publish a conversation event through `EventPublisher`; nothing is published when nothing changed. `RequestAssignmentUseCase` publishes a request after checking the role and the id formats, and reads no stored data. It may import `conversations-domain` and `@shared/core`, never Nest or Mongoose, and never the agents libraries: `AgentLookup` is how it asks about agents.

## Tests

```sh
npx nx test conversations-application
```
