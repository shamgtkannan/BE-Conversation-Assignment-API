# conversations-application

The conversation use cases (create, get, list, assign, unassign, request an assignment, record and list assignment history), the ports they need (`ConversationRepository`, `AgentLookup`, `EventPublisher`, `AssignmentRequestPublisher`, `AssignmentHistoryRepository`, `IdGenerator`, `Clock`, with their injection tokens), the `ASSIGNING_ROLES` rule and in-memory test doubles.

Plain classes with no Nest decorators. `assign` and `unassign` save with the version they read (a clash throws `ConversationConcurrentModificationError`) and publish nothing: the event is made from the saved change by `AnnounceAssignmentUseCase`, which hands the domain rule's result to `EventPublisher`. `RequestAssignmentUseCase` reads the conversation and the agent, refuses what cannot succeed (role, ids, not found, closed), and only then publishes a request; it never changes anything. It may import `conversations-domain` and `@shared/core`, never Nest or Mongoose, and never the agents libraries: `AgentLookup` is how it asks about agents.

## Tests

```sh
npx nx test conversations-application
```
