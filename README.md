# Conversation Assignment API

A REST API that manages support agents and customer conversations, and lets admins and managers assign, reassign and unassign conversations to agents. Built with TypeScript, NestJS 11, Nx, Mongoose, MongoDB 8.0 and Jest, following Clean Architecture (domain-driven design, hexagonal ports and adapters) and developed test-first.

All endpoints from the assignment are implemented:

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/agents` | Create an agent |
| GET | `/agents` | List agents (cursor pagination) |
| GET | `/agents/:id` | Get an agent |
| POST | `/conversations` | Create a conversation |
| GET | `/conversations` | List conversations (cursor pagination, filter by `status` and `assignedAgentId`) |
| GET | `/conversations/:id` | Get a conversation |
| PATCH | `/conversations/:id/assignment` | Assign or reassign an agent |
| DELETE | `/conversations/:id/assignment` | Remove the assignment |

## Contents

1. [Prerequisites](#prerequisites)
2. [Install](#1-install)
3. [Start MongoDB](#2-start-mongodb)
4. [Run the API](#3-run-the-api)
5. [Environment variables](#environment-variables)
6. [API reference](#api-reference)
7. [Testing](#testing)
8. [Architecture](#architecture)
9. [Decisions and assumptions](#decisions-and-assumptions)
10. [Not implemented](#not-implemented)

## Prerequisites

- Node 20 (`nvm use` reads `.nvmrc`)
- Docker Desktop, or any Docker with Compose v2, running

MongoDB runs from the `docker-compose.yml` in this repository: MongoDB 8.0 as a single-node replica set (the API needs a replica set name). No other repository and no `/etc/hosts` change is needed.

## 1. Install

```sh
nvm use
npm install
cp .env.example .env
```

`.env` is git-ignored. Its defaults match the compose file below. Change them only if you change the compose file or use another MongoDB.

## 2. Start MongoDB

```sh
docker compose up -d --wait
```

`--wait` returns when the container is healthy, which takes about 10 seconds the first time. The container (`assignment-mongo`) initialises the replica set `mongodb-test` by itself and listens on `localhost:27017`. The port is bound to the loopback interface only, because there is no authentication.

Check that it worked. The only member should be `PRIMARY`:

```sh
docker exec assignment-mongo mongosh --quiet \
  --eval 'rs.status().members.map(m => m.name + " " + m.stateStr)'
```

Data is kept in a named volume, so it survives `docker compose stop` and `docker compose down`.

| To | Run |
|---|---|
| Stop, keep the data | `docker compose stop` |
| Remove the container, keep the data | `docker compose down` |
| Remove the container and all data | `docker compose down -v` |

To use a different MongoDB, for example a three-node replica set, change `MONGODB_HOSTS`, `MONGODB_REPLICA_SET` and the `MONGODB_TEST_*` variables (see [Environment variables](#environment-variables)).

## 3. Run the API

```sh
npx nx serve api
```

The API listens on http://localhost:3000. It refuses to start without `MONGODB_HOSTS`, `MONGODB_DATABASE` and `MONGODB_REPLICA_SET`, and fails after about 5 seconds if MongoDB is not reachable. Indexes are created from the Mongoose schemas when the API starts.

A production build: `npx nx build api`, then `node dist/apps/api/main.js` with the same environment variables.

### Environment variables

The API reads `.env` from the working directory. Variables already set in the environment take precedence.

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | HTTP port | `3000` |
| `MONGODB_HOSTS` | Comma-separated `host:port` list | none (required) |
| `MONGODB_DATABASE` | Database name | none (required) |
| `MONGODB_REPLICA_SET` | Replica set name | none (required) |
| `MONGODB_POOL_SIZE` | Connection pool size | `10` |
| `MONGODB_TEST_HOSTS` | Integration tests only: MongoDB hosts | `localhost:27017` |
| `MONGODB_TEST_REPLICA_SET` | Integration tests only: replica set name | `mongodb-test` |
| `MONGODB_TEST_DATABASE` | Integration tests only: base database name, which must end in `_test`. Each suite adds its own suffix. | `assignment_test` |

## API reference

### Postman collection

`postman/assignment-api.postman_collection.json` has a request for every endpoint, 54 in all, grouped as Authentication, Agents, Conversations and Assignment. Each request has test scripts that check the status code and the response. The Assignment folder covers every rule in the specification: valid assignment, reassignment, the same agent twice, unassigning, an unknown agent or conversation, another workspace, a closed conversation, the `agent` role, and invalid bodies.

1. Start MongoDB and the API (steps 2 and 3 above).
2. In Postman, choose Import and select the file.
3. Run the collection with the Collection Runner, in order. Requests save the ids they create as collection variables, and agent emails are generated per run, so it can be run again against the same database.

The settings (`baseUrl`, `userId`, `workspaceId`, `role` and a few more) have defaults on the collection's Variables tab, so importing the collection alone works. To point it elsewhere, also import `postman/local.postman_environment.json`, edit its values and select it in Postman: its values override the collection's defaults. With the command line runner, `npx newman run postman/assignment-api.postman_collection.json -e postman/local.postman_environment.json` does the same.

The `curl` examples below show the same calls.

### Authentication (mock)

There is no login. Every request carries three headers that stand in for real authentication:

| Header | Meaning |
|---|---|
| `x-user-id` | The acting user. Recorded as `assignedBy` on an assignment. |
| `x-workspace-id` | The caller's workspace. Every operation is scoped to it. |
| `x-role` | `admin`, `manager` or `agent`. |

A missing or invalid header gives `401`. `workspaceId` and `assignedBy` always come from these headers and are never accepted from a request body. A body or query string with an unknown field gives `400`.

Only `admin` and `manager` may assign or unassign (`403` otherwise). Every other endpoint is open to all three roles, within their own workspace.

The examples below use this shell variable:

```sh
H=(-H 'content-type: application/json' -H 'x-user-id: user_123' -H 'x-workspace-id: workspace_1' -H 'x-role: manager')
```

### Ids

Ids are MongoDB ObjectIds exposed as 24-character lowercase hex strings, for example `65f1a2b3c4d5e6f708091a2b`. The ids in the assignment's examples, such as `conv_123`, are not valid here and return `400`. A well-formed id that does not exist in your workspace returns `404`, and so does an id that belongs to another workspace, so one workspace cannot probe another's ids.

### Status codes

| Status | When |
|---|---|
| `200` | Success for reads, assign and unassign |
| `201` | An agent or conversation was created |
| `400` | Invalid body, query or id, unknown fields, bad paging token or limit |
| `401` | Missing or invalid auth headers |
| `403` | The `agent` role tries to assign or unassign |
| `404` | Conversation or agent not found in the caller's workspace |
| `409` | Assigning a closed conversation, a duplicate agent email in the workspace, or a conversation that someone else changed while the request was running (send it again) |

Error bodies from the domain and the auth guard look like this:

```json
{ "statusCode": 404, "message": "Conversation 65f1a2b3c4d5e6f708091a2b was not found", "error": "Not Found" }
```

Body and query validation errors (`400`) have the same fields, but `message` is a list of strings, one per problem, for example `["agentId should not be empty"]`.

### Agents

Create an agent. The email is trimmed, lower-cased and checked as an address. It must be unique within the workspace, which a unique index on `{ workspaceId, email }` enforces in the database:

```sh
curl -i -X POST http://localhost:3000/agents "${H[@]}" \
  -d '{"name": "Ada Lovelace", "email": "Ada@Example.com"}'
```

`201` with `{ id, name, email, workspaceId, createdAt, updatedAt }`. The same email again in the same workspace gives `409`. A blank name or an invalid email gives `400`.

```sh
curl -s 'http://localhost:3000/agents?limit=2' "${H[@]}"      # list
curl -s http://localhost:3000/agents/<agent-id> "${H[@]}"      # get one
```

### Conversations

Create a conversation. `status` is optional, `open` or `closed`, and defaults to `open`. A blank subject gives `400`:

```sh
curl -i -X POST http://localhost:3000/conversations "${H[@]}" \
  -d '{"subject": "Unable to log in"}'
```

`201` with the conversation. `assignedAgentId`, `assignedAt` and `assignedBy` are `null` until an agent is assigned.

```sh
curl -s http://localhost:3000/conversations/<conversation-id> "${H[@]}"
```

List, with optional filters that combine. An unknown `status` or a malformed `assignedAgentId` gives `400`:

```sh
curl -s 'http://localhost:3000/conversations?status=open&assignedAgentId=<agent-id>&limit=20' "${H[@]}"
```

### Pagination

List endpoints use cursor pagination, newest first (`createdAt` descending, the id breaks ties). The query parameters are `limit` (1 to 100, default 20) and either `next` or `previous` (never both). The response is:

```json
{ "items": [], "hasNext": true, "next": "<token>", "hasPrevious": false, "previous": null }
```

Pass `next` back as `?next=<token>` for older items, or `previous` as `?previous=<token>` for newer ones. Tokens are opaque, and a malformed token returns `400`. A token never widens the query beyond the caller's workspace. There is no total count and no jumping to a page number.

### Assign, reassign and unassign

```sh
# assign or reassign (admin or manager)
curl -i -X PATCH http://localhost:3000/conversations/<conversation-id>/assignment "${H[@]}" \
  -d '{"agentId": "<agent-id>"}'

# remove the assignment (admin or manager)
curl -i -X DELETE http://localhost:3000/conversations/<conversation-id>/assignment "${H[@]}"
```

Both return `200` with the whole conversation. After an assign:

```json
{
  "id": "65f1a2b3c4d5e6f708091a2b",
  "subject": "Unable to log in",
  "status": "open",
  "workspaceId": "workspace_1",
  "assignedAgentId": "65f1a2b3c4d5e6f708091a2c",
  "assignedAt": "2026-11-13T08:30:00.000Z",
  "assignedBy": "user_123",
  "createdAt": "2026-11-13T08:00:00.000Z",
  "updatedAt": "2026-11-13T08:30:00.000Z"
}
```

After an unassign, `assignedAgentId`, `assignedAt` and `assignedBy` are `null`.

Rules, as implemented:

- A conversation has at most one agent. Assigning a different agent replaces the previous one, along with `assignedAt` and `assignedBy`.
- The agent and the conversation must both exist in the caller's workspace, otherwise `404`.
- A closed conversation cannot be assigned or reassigned (`409`), even to its current agent.
- Assigning the agent who is already assigned changes nothing and writes nothing: `assignedAt`, `assignedBy` and `updatedAt` stay as they were.
- Unassigning clears `assignedAgentId`, `assignedAt` and `assignedBy`. They become `null` in the response and are absent in the database. Unassigning an unassigned conversation is a harmless `200`. A closed conversation can be unassigned.
- The checks run in this order, so a caller without the right never learns what exists: role (`403`), id formats (`400`), conversation (`404`), agent (`404`), closed (`409`). Body validation (`400`) runs before all of them.
- Simultaneous changes to one conversation are safe (optimistic concurrency): each request is written only if nobody changed the conversation since it was read. Of several requests that read the same state, exactly one wins; the others get `409` and can simply be sent again. See the decision below.

To look at the stored documents:

```sh
docker exec assignment-mongo mongosh --quiet assignment \
  --eval 'db.conversations.find().toArray()'
```

## Testing

```sh
npx nx run-many -t test            # unit tests, no database needed
npx nx run-many -t lint
npx nx run-many -t integration     # real MongoDB, needs step 2
```

Single projects: `npx nx test conversations-application`, `npx nx integration api`, `npx nx integration agents-infra`, `npx nx integration conversations-infra`.

**Unit tests** use in-memory fakes of the ports, so they need no Nest or MongoDB. The assignment use cases are in `packages/conversations/application/src/lib` (`assign-conversation.use-case.spec.ts` and `unassign-conversation.use-case.spec.ts`). They cover:

| Required case | Where |
|---|---|
| Valid agent assignment | `assign-conversation.use-case.spec.ts` |
| Assign nonexistent agent | `assign-conversation.use-case.spec.ts` (404) |
| Assign nonexistent conversation | `assign-conversation.use-case.spec.ts` (404) |
| Cross-workspace assignment | Agent and conversation of another workspace, both 404 |
| Assign closed conversation | 409, nothing saved |
| Reassign conversation | The previous agent, time and user are replaced |
| Assign same agent again | No write |
| Unassign conversation | `unassign-conversation.use-case.spec.ts`, the three fields cleared |
| Unauthorized user | The `agent` role and unknown roles, rejected before anything is read |
| Invalid request body | `conversations.assign.controller.spec.ts` in `apps/api/src/modules/conversations`, which runs the real validation pipe and exception filter against fake use cases. Malformed ids are covered in the use case specs. |

The domain rules (`assign`, `unassign`) have their own specs in `packages/conversations/domain`.

**Integration tests** run the repositories and the whole API against a real MongoDB, never a production one. They are the `*.integration.spec.ts` files in `apps/api/src/app` and in the two `infra` libraries. Each suite uses its own database (for example `assignment_api_test`, derived from `MONGODB_TEST_DATABASE`), refuses any database name that does not end in `_test`, and drops it when finished. They check what is actually stored, such as the unique email index and the assignment fields being absent after an unassign.

Continuous integration (`.github/workflows/ci.yml`) runs the unit tests only. The integration tests need MongoDB.

## Architecture

Clean Architecture, expressed as ports and adapters. Source dependencies point inward only: adapters know the application, the application knows the domain, and the domain knows nothing.

```
packages/
  shared/core/                 entity id check, cursor pagination (Page, PageRequest)
  agents/
    domain/                    Agent, domain errors
    application/               use cases, AgentRepository port, in-memory test double
    infra/                     Mongoose schema, repository, id generator
  conversations/
    domain/                    Conversation (create, assign, unassign, restore, version), conversation events, domain errors
    application/               use cases, ConversationRepository, AgentLookup and EventPublisher ports, test doubles
    infra/                     Mongoose schema, indexes, repository, id generator
apps/
  api/src/
    auth/                      mock AuthGuard, @CurrentAuth()
    common/                    DomainExceptionFilter, MongoModule, SystemClock, NoopEventPublisher
    modules/agents/            controller, DTOs, response mapping, Nest module
    modules/conversations/     controller, DTOs, response mapping, Nest module, agent-lookup adapter
```

- **Domain** holds the entities and business rules and imports no framework or database. `Conversation` is immutable: `assign` and `unassign` return a new conversation, or the same instance when nothing changes.
- **Application** holds plain-class use cases and the ports they need (`ConversationRepository`, `AgentLookup`, `EventPublisher`, `Clock`, `IdGenerator`). The role check lives in the use case, so it holds without HTTP.
- **Infra** implements the ports with Mongoose: schemas, mappers between documents and entities, and indexes.
- **apps/api** is the presentation layer and composition root. Controllers only validate input, take the caller from `@CurrentAuth()` and delegate. Modules build the use cases with `useFactory` and bind ports to adapters through Symbol tokens. The `DomainExceptionFilter` turns domain errors into HTTP statuses in one place, so controllers never catch.
- **Contexts stay separate.** Conversations must know whether an agent exists, so it owns an `AgentLookup` port. `AgentsBackedAgentLookup` in `apps/api` implements it by calling the agents `GetAgentUseCase`. The two contexts never import each other.
- **Shared core** holds only what both contexts would otherwise copy: the id format and the cursor pagination.

Boundaries are enforced by Nx tags in `eslint.config.mjs` (`scope:*`, `layer:*`), which also bans `@nestjs/*` and `mongoose` imports in domain and application code and forbids `any`. `npx nx graph` shows the project graph.

MongoDB indexes, declared on the schemas:

| Collection | Index | Serves |
|---|---|---|
| `agents` | `{ workspaceId: 1, email: 1 }`, unique | Unique email per workspace |
| `agents` | `{ workspaceId: 1, createdAt: -1, _id: -1 }` | The paginated list |
| `conversations` | `{ workspaceId: 1, createdAt: -1, _id: -1 }` | The paginated list |
| `conversations` | `{ workspaceId: 1, status: 1, createdAt: -1, _id: -1 }` | Filter by status |
| `conversations` | `{ workspaceId: 1, assignedAgentId: 1, createdAt: -1, _id: -1 }` | Filter by assigned agent |

## Decisions and assumptions

- **REST.** The assignment calls this a "JSON-RPC REST API" but its examples are plain REST, so the routes, bodies and status codes follow the examples.
- **ObjectId ids**, exposed as strings (see [Ids](#ids)).
- **Absent versus `null`.** An unassigned conversation stores no assignment fields. The API returns them as `null`, as in the assignment's examples.
- **Agent email** is trimmed, lower-cased and validated as an address. Provider-specific rules (dots or `+tags` in Gmail) are not applied, because they would merge distinct mailboxes at other providers.
- **Cursor pagination** was chosen because the assignment only says "implement pagination". It stays stable when rows are added while someone pages. The cost is no total count and no page numbers.
- **Timestamps** are set by the application in UTC and stored as MongoDB dates. Responses use ISO 8601 with a `Z` suffix, not Mongoose's `timestamps` option, so tests control the clock.
- **Writes** use majority write concern. The connection fails fast (about 5 seconds) when MongoDB is not reachable.
- **Another workspace's resource is a `404`**, the same as a missing one.
- **Where the assignment and a convention disagree**, the assignment wins, for example `403` for a forbidden role and `409` for a duplicate email.
- **Unassigning a closed conversation is allowed.** The assignment freezes only assigning and reassigning.
- **Concurrency (bonus 3) uses a version number.** Every conversation stores a `version` that goes up by one with each assignment change. Saving a change is one atomic MongoDB update that matches the id, the workspace and the version that was read, so of several simultaneous requests exactly one is written and the rest fail with `409` (nothing is written for them). A time stamp would not do, because two changes can share a millisecond. The version is internal and not part of the API response; documents stored before it existed count as version 0. Requests that were not in step with each other can all succeed one after another, which is correct: the version equals the number of successful changes.
- **Events are built by the use cases.** After a real assignment change the use case publishes `conversation.assigned.v1` (or `conversation.unassigned.v1`) through the `EventPublisher` port, once, after the save. For now the port is bound to a no-op adapter, so nothing leaves the process yet.

## Not implemented

- **Bonus 1, assignment history.** No audit trail is kept.
- **Bonus 2, Kafka event.** The event is built and handed to the `EventPublisher` port, but no Kafka adapter exists yet, so `conversation.assigned.v1` is not published to Kafka. To avoid losing the event when the database write succeeds but publishing fails, I would use the transactional outbox pattern: write the event to an `outbox` collection in the same transaction as the assignment, and let a separate relay publish it and mark it sent. Publishing is then at least once, so consumers must tolerate duplicates.
- **Real authentication.** Only the mock header guard exists.
