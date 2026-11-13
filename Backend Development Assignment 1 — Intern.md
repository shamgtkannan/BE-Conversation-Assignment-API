# Backend Development Assignment — Intern

**Task:** Conversation Assignment API  
**Estimated Duration:** 2-4 working days  
**Tech Stack:** TypeScript, NestJS, MongoDB  
**Architecture:** Clean Architecture
**Testing:** Jest, TDD

## 1. Objective

Build a JSON-RPC REST API that manages the assignment of customer support conversations to support agents.

The goal is to demonstrate your understanding of backend development, API design, database operations, validation, business logic, and automated testing.

This is a **backend-only assignment**. No frontend implementation is required.

## 2. Business Scenario

A customer support platform receives conversations from different customers. Each conversation can be assigned to a support agent who is responsible for handling it.

The system must allow authorized users to assign, reassign, and unassign conversations.

Each conversation belongs to a workspace, and an agent can only be assigned to conversations within the same workspace.

## 3. Functional Requirements

### 3.1 Agent Management

Implement the following endpoints:

| Method | Endpoint | Description |
|---|---|---|
| POST | `/agents` | Create a support agent |
| GET | `/agents` | List support agents |
| GET | `/agents/:id` | Get an agent by ID |

Agent fields:

- `id`
- `name`
- `email`
- `workspaceId`
- `createdAt`
- `updatedAt`

Ensure that agent email addresses are unique within a workspace.

### 3.2 Conversation Management

Implement the following endpoints:

| Method | Endpoint | Description |
|---|---|---|
| POST | `/conversations` | Create a conversation |
| GET | `/conversations` | List conversations |
| GET | `/conversations/:id` | Get conversation details |
| PATCH | `/conversations/:id/assignment` | Assign or reassign an agent |
| DELETE | `/conversations/:id/assignment` | Remove an assignment |

Conversation fields:

- `id`
- `subject`
- `status` (`open`, `closed`)
- `workspaceId`
- `assignedAgentId` (nullable)
- `assignedAt` (nullable)
- `assignedBy` (nullable)
- `createdAt`
- `updatedAt`

### 3.3 Assignment Business Rules

Implement the following rules:

1. A conversation can have only one assigned agent at a time.
2. The selected agent must exist.
3. The conversation must exist.
4. The agent and conversation must belong to the same workspace.
5. Closed conversations cannot be assigned or reassigned.
6. Reassigning a conversation should replace the previous agent.
7. Unassigning should clear `assignedAgentId`, `assignedAt`, and `assignedBy`.
8. Assigning the same agent twice should not unnecessarily modify the assignment.
9. Every assignment or reassignment must record the user who performed the action.
10. All operations must be scoped to the authenticated user's workspace.

## 4. API Examples

### Assign a conversation

**Request**

`PATCH /conversations/conv_123/assignment`

```json
{
  "agentId": "agent_456"
}
```

**Response — 200 OK**

```json
{
  "id": "conv_123",
  "subject": "Unable to log in",
  "status": "open",
  "workspaceId": "workspace_1",
  "assignedAgentId": "agent_456",
  "assignedAt": "2026-11-13T08:30:00.000Z",
  "assignedBy": "user_123"
}
```

### Unassign a conversation

**Request**

`DELETE /conversations/conv_123/assignment`

**Response — 200 OK**

```json
{
  "id": "conv_123",
  "assignedAgentId": null,
  "assignedAt": null,
  "assignedBy": null
}
```

### Error Handling

Use appropriate HTTP status codes.

| Scenario | Status |
|---|---|
| Invalid request body | 400 Bad Request |
| Missing or invalid authentication | 401 Unauthorized |
| User lacks required permission | 403 Forbidden |
| Conversation or agent not found in workspace | 404 Not Found |
| Assigning a closed conversation | 409 Conflict |
| Duplicate agent email within workspace | 409 Conflict |

## 5. Technical Requirements

### Architecture

Follow Clean Architecture principles:

- **Domain:** Entities, business rules, and domain-specific errors.
- **Application:** Use cases and repository interfaces.
- **Infrastructure:** MongoDB implementations and persistence mapping.
- **Presentation:** NestJS controllers, DTOs, and request validation.

Recommended folder structure (adapt it to the repository's existing conventions):

```text
packages/
  agents/
    domain/
    application/
    infra/

  conversations/
    domain/
    application/
    infra/

apps/
  api/
    src/
      modules/
        agents/
        conversations/
```

Important architecture rules:

- Controllers must not contain business logic.
- Domain code must not depend on NestJS or MongoDB.
- Use dependency injection.
- Do not access MongoDB directly from controllers.
- Avoid circular dependencies.
- Different domains must not directly import each other's business implementations.
- Use existing shared infrastructure where appropriate.
- Avoid using `any` in TypeScript.

### MongoDB

- Use MongoDB for persistence.
- Define appropriate indexes.
- Implement pagination for list endpoints.
- Support filtering conversations by status and assigned agent.
- Handle invalid and nonexistent IDs.
- Use UTC timestamps.
- Enforce workspace-scoped uniqueness for agent emails at the database level.

### Authentication

Use the project's existing authentication mechanism where available.

For a standalone assignment, a provided mock authentication guard may be used. The authenticated context must supply:

```typescript
interface AuthContext {
  userId: string;
  workspaceId: string;
  role: 'admin' | 'manager' | 'agent';
}
```

Only admins and managers may assign or unassign conversations.

Do not accept `workspaceId` or `assignedBy` from the assignment request body. Derive these values from the authenticated context.

## 6. Testing Requirements

Write unit tests using Jest for the assignment use cases.

At minimum, cover:

| Test Case | Expected Result |
|---|---|
| Valid agent assignment | Success |
| Assign nonexistent agent | Rejected |
| Assign nonexistent conversation | Rejected |
| Cross-workspace assignment | Rejected |
| Assign closed conversation | Rejected |
| Reassign conversation | Previous assignment replaced |
| Assign same agent again | No unnecessary update |
| Unassign conversation | Assignment cleared |
| Unauthorized user | Rejected |
| Invalid request body | Validation error |

Additionally, write integration tests for the main API endpoints using a test MongoDB database.

Tests must not depend on production databases or services.

## 7. Bonus Tasks (Optional)

These tasks are not required for successful completion.

**Bonus 1 — Assignment History**

Maintain an audit history of conversation assignments, including previous agent, new agent, timestamp, and the user who performed the action.

**Bonus 2 — Kafka Event**

Publish a `conversation.assigned.v1` event after a successful assignment.

Explain how you would prevent losing an event if database persistence succeeds but Kafka publishing fails.

**Bonus 3 — Concurrency**

Handle simultaneous assignment attempts using optimistic concurrency control or conditional MongoDB updates.

## 8. Deliverables

Submit:

1. Complete source code in a Git repository.
2. Working REST APIs.
3. MongoDB schemas, indexes, and repository implementations.
4. Unit and integration tests.
5. A Postman collection or equivalent API examples.
6. README with installation, environment variables, execution, and testing instructions.
7. A pull request with a brief explanation of the implementation and architectural decisions.

Provide a Docker Compose configuration for local MongoDB if the project does not already include one.

## 9. Definition of Done

The assignment is considered complete when:

- All mandatory endpoints work correctly.
- Business rules are enforced.
- Workspace isolation and authorization are implemented.
- Request validation and error handling work.
- Data persists correctly in MongoDB.
- Required automated tests pass.
- The project can be started locally using documented commands.
- A pull request is submitted for review.

**Important:** You may use AI coding assistants, but you must understand and be able to explain all submitted code. Be prepared to demonstrate the API and discuss your architecture, database decisions, and test coverage during the code review.