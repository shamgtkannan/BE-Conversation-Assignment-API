# Conversation Assignment API

A REST API that manages support agents and customer conversations, and lets admins and manag
assign, reassign and unassign conversations. Built with NestJS 11, Nx, Mongoose, MongoDB 8.0 and Jest,
following Clean Architecture (domain-driven design, hexagonal ports and adapters) and develo

All endpoints from the assignment are implemented:

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/agents` | Create an agent |
| GET | `/agents` | List agents (cursor pagination) |
| GET | `/agents/:id` | Get an agent |
| POST | `/conversations` | Create a conversation |
| GET | `/conversations` | List conversations (cursor pagination, filter by `status` and `as
| GET | `/conversations/:id` | Get a conversation |
| PATCH | `/conversations/:id/assignment` | Assign or reassign an agent |
| DELETE | `/conversations/:id/assignment` | Remove the assignment |

## Contents

1. [Prerequisites](#prerequisites)
2. [Install](#1-install)
3. [Map the MongoDB host names](#2-map-the-mongodb-host-names-once-per-machine)
4. [Start MongoDB](#3-start-mongodb)
5. [Serve the API](#4-serve-the-api)
6. [Environment variables](#environment-variables)
7. [API reference](#api-reference)
8. [Testing](#testing)
9. [Architecture](#architecture)
10. [Decisions and assumptions](#decisions-and-assumptions)
11. [Not implemented](#not-implemented)

## Prerequisites

- Node 20 (`nvm use` reads `.nvmrc`)
- Docker Desktop, running
- The MongoDB compose setup at `../docker/compose/mongodb-8.0` (a 3-node replica set, `mongo:8.0`).
  It sits next to this repository in the shared `docker` folder; the commands below assume t
  The `docker-compose.yml` in this repository root (a single `mongo:7` without a replica set) is not used,
  because the API requires a replica set name.

## 1. Install

```sh
nvm use
npm install
cp .env.example .env
```

`.env` is git-ignored. The defaults match the compose setup below; change them only if you c
the compose file.

## 2. Map the MongoDB host names (once per machine)

The replica set announces its members as `mongodb1`, `mongodb2` and `mongodb3`, so your machine
must resolve those names. Add this to `/etc/hosts` (needs `sudo`), unless the line is alread

```
127.0.0.1 mongodb1 mongodb2 mongodb3
```

Check with `grep mongodb /etc/hosts`.

## 3. Start MongoDB

Open Docker Desktop and wait until it says it is running, then:
Clone Tawk.to docker compose repository in the parent directory for standardised vcersion of mongodb:

git clone git@ssh.bitbucket.org:tawkto/docker.git

```sh
docker compose -f ../docker/compose/mongodb-8.0/docker-compose.yml up -d --build
```

This starts three `mongo:8.0` containers (ports 27801, 27802, 27803) and a one-shot
`mongodb-80-configurator` container that initialises the replica set `mongodb-test` and then exits.

Check that it worked. One member should be `PRIMARY` and the others `SECONDARY`:

```sh
docker exec mongodb-80-1 mongosh --port 27801 --quiet \
  --eval 'rs.status().members.map(m => m.name + " " + m.stateStr)'
```

Right after start-up all three can show `SECONDARY` for up to about 30 seconds while the ele
finishes. Wait and run the command again. To block until a primary exists:

```sh
until docker exec mongodb-80-1 mongosh --port 27801 --quiet \
  --eval 'quit(db.hello().isWritablePrimary || db.hello().primary ? 0 : 1)' >/dev/null 2>&1; do sleep 2; done; echo ready
```

If it is still all `SECONDARY` after a minute, look at `health` and `lastHeartbeatMessage` p
`rs.status()`; a heartbeat error means the containers cannot reach each other.

Stop it with `docker compose -f ../docker/compose/mongodb-8.0/docker-compose.yml down`. That setup has no
volumes, so removing the containers deletes all data.

## 4. Serve the API

```sh
npx nx serve api
```

The API listens on http://localhost:3000. It refuses to start without `MONGODB_HOSTS`, `MONG
and `MONGODB_REPLICA_SET`, and fails after about 5 seconds if MongoDB is not reachable. Indexes are created
from the Mongoose schemas when the API starts.

A production build: `npx nx build api`, then `node dist/apps/api/main.js` with the same envi

### Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | HTTP port | `3000` |
| `MONGODB_HOSTS` | Comma-separated `host:port` list | none (required) |
| `MONGODB_DATABASE` | Database name | none (required) |
| `MONGODB_REPLICA_SET` | Replica set name | none (required) |
| `MONGODB_POOL_SIZE` | Connection pool size | `10` |
| `MONGODB_TEST_HOSTS`, `MONGODB_TEST_REPLICA_SET`, `MONGODB_TEST_DATABASE` | Integration tests only. The database name must end in `_test`; each suite adds its own suffix to it. | the compose setup,
`assignment_test` |

## API reference

### Authentication (mock)

There is no login. Every request carries three headers that stand in for real authentication

| Header | Meaning |
|---|---|
| `x-user-id` | The acting user. Recorded as `assignedBy` on an assignment. |
| `x-workspace-id` | The caller's workspace. Every operation is scoped to it. |
| `x-role` | `admin`, `manager` or `agent`. |

A missing or invalid header gives `401`. `workspaceId` and `assignedBy` always come from the
never accepted from a request body; a body or query string with an unknown field gives `400`.
Only `admin` and `manager` may assign or unassign (`403` otherwise); every other endpoint is
within their own workspace.

The examples below use this shell variable:

```sh
H=(-H 'content-type: application/json' -H 'x-user-id: user_123' -H 'x-workspace-id: workspac
```

### Ids

Ids are MongoDB ObjectIds exposed as 24-character lowercase hex strings (for example `65f1a2b3c4d5e6f708091a2b`).
Ids in the assignment's examples such as `conv_123` are not valid here and return `400`. A w
does not exist in your workspace returns `404`, and so does an id that belongs to another workspace, so one workspace
cannot probe another's ids.

### Status codes

| Status | When |
|---|---|
| `400` | Invalid body, query or id, unknown fields, bad paging token or limit |
| `401` | Missing or invalid auth headers |
| `403` | The `agent` role tries to assign or unassign |
| `404` | Conversation or agent not found in the caller's workspace |
| `409` | Assigning a closed conversation; a duplicate agent email in the workspace |

Error bodies look like `{ "statusCode": 404, "message": "...", "error": "Not Found" }`.

### Agents

Create an agent. The email is trimmed, lower-cased and checked as an address; it must be uni
(enforced by a unique index on `{ workspaceId, email }`):

```sh
curl -i -X POST http://localhost:3000/agents "${H[@]}" \
  -d '{"name": "Ada Lovelace", "email": "Ada@Example.com"}'
```

`201` with `{ id, name, email, workspaceId, createdAt, updatedAt }`. The same email again in9`.

```sh
curl -s 'http://localhost:3000/agents?limit=2' "${H[@]}"      # list
curl -s http://localhost:3000/agents/<agent-id> "${H[@]}"      # get one
```

### Conversations

Create a conversation (`status` is optional, `open` or `closed`, default `open`):

```sh
curl -i -X POST http://localhost:3000/conversations "${H[@]}" \
  -d '{"subject": "Unable to log in"}'
```

`201` with the conversation. `assignedAgentId`, `assignedAt` and `assignedBy` are `null` unt

```sh
curl -s http://localhost:3000/conversations/<conversation-id> "${H[@]}"
```

List, with optional filters (both combine):

```sh
curl -s 'http://localhost:3000/conversations?status=open&assignedAgentId=<agent-id>&limit=20' "${H[@]}"
```

### Pagination

List endpoints use cursor pagination, newest first (`createdAt` descending, the id breaks ti
`limit` (1 to 100, default 20), and either `next` or `previous` (never both). The response is:

```json
{ "items": [], "hasNext": true, "next": "<token>", "hasPrevious": false, "previous": null }
```

Pass `next` back as `?next=<token>` for older items, or `previous` as `?previous=<token>` for newer ones. Tokens are
opaque; a malformed token returns `400`. A token never widens the query beyond the caller's
no total count and no jumping to a page number.

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

Rules, as implemented:

- A conversation has at most one agent. Assigning a different agent replaces the previous onAt` and `assignedBy`.
- The agent and the conversation must both exist in the caller's workspace, otherwise `404`.
- A closed conversation cannot be assigned or reassigned (`409`), even to its current agent.
- Assigning the agent who is already assigned changes nothing and writes nothing: `assignedAt`, `assignedBy` and `updatedAt` stay as they were.
- Unassigning clears `assignedAgentId`, `assignedAt` and `assignedBy` (they become `null` innt in the database). Unassigning an unassigned conversation is a harmless `200`. A closedconversation can be unassigned.
- The checks run in this order, so a caller without the right never learns what exists: role`), conversation (`404`), agent (`404`), closed (`409`). Body validation (`400`) runs beforeall of them.

Look at the stored documents:

```sh
docker exec mongodb-80-1 mongosh --port 27801 --quiet assignment \
  --eval 'db.conversations.find().toArray()'
```

## Testing

```sh
npx nx run-many -t test            # unit tests, no database needed
npx nx run-many -t lint
npx nx run-many -t integration     # real MongoDB, needs step 3
```

Single projects: `npx nx integration agents-infra`, `npx nx integration conversations-infra`.

**Unit tests** use in-memory fakes of the ports, so they need no Nest or MongoDB. For the as
(`assign-conversation.use-case.spec.ts`, `unassign-conversation.use-case.spec.ts` in `packages/conversations/application`)
they cover: valid assignment, nonexistent agent, nonexistent conversation, cross-workspace a
closed conversation, reassignment replacing the previous agent, the same agent twice with no write, unassignment
clearing the fields, and unauthorized roles. Invalid request bodies are covered by the contr
`apps/api/src/modules/conversations`, which run the real validation pipe and exception filter against fake use cases.
The domain rules (`assign`, `unassign`) have their own specs in `packages/conversations/doma

**Integration tests** run the repositories and the whole API against a real MongoDB, never a
each suite uses its own database (`assignment_agents_infra_test`, `assignment_conversations_infra_test`,
`assignment_api_test`, derived from `MONGODB_TEST_DATABASE`), refuses any database name that
and drops it when finished. They check what is actually stored, such as unique indexes and the assignment fields
being absent after an unassign.

## Architecture

Clean Architecture, expressed as ports and adapters. Source dependencies point inward only:
adapters know the application, the application knows the domain, the domain knows nothing.

```
packages/
  shared/core/                 entity id check, cursor pagination (Page, PageRequest)
  agents/
    domain/                    Agent, domain errors
    application/               use cases, AgentRepository port, in-memory test double
    infra/                     Mongoose schema, repository, id generator
  conversations/
    domain/                    Conversation (create, assign, unassign, restore), domain errors
    application/               use cases, ConversationRepository and AgentLookup ports, test
    infra/                     Mongoose schema, indexes, repository, id generator
apps/
  api/src/
    auth/                      mock AuthGuard, @CurrentAuth()
    common/                    DomainExceptionFilter, MongoModule, SystemClock
    modules/agents/            controller, DTOs, response mapping, Nest module
    modules/conversations/     controller, DTOs, response mapping, Nest module, agent-lookup adapter
```

- **Domain** holds the entities and business rules and imports no framework or database.
- **Application** holds plain-class use cases and the ports they need (`ConversationRepository`, `AgentLookup`, `Clock`,
  `IdGenerator`). The role check lives in the use case, so it holds without HTTP.
- **Infra** implements the ports with Mongoose: schemas, mappers between documents and entities, indexes.
- **apps/api** is the presentation layer and composition root: controllers only validate inples
  build the use cases with `useFactory` and bind ports to adapters through Symbol tokens. The `DomainExceptionFilter`
  turns domain errors into HTTP statuses in one place, so controllers never catch.
- **Contexts stay separate.** Conversations must know whether an agent exists, so it owns an `AgentLookup` port;
  `AgentsBackedAgentLookup` in `apps/api` implements it by calling the agents `GetAgentUseCa
  import each other.

Boundaries are enforced by Nx tags in `eslint.config.mjs` (`scope:*`, `layer:*`), which also bans `@nestjs/*` and
`mongoose` imports in domain and application code and forbids `any`. `npx nx graph` shows th

## Decisions and assumptions

- **REST.** REST with JSON payload.
- **ObjectId ids**, exposed as strings (see [Ids](#ids)).
- **Absent versus `null`.** An unassigned conversation stores no assignment fields; the API
- **Agent email** is trimmed, lower-cased and validated as an address. Provider-specific rules (dots or `+tags` in Gmail) are not applied, because they would merge distinct mailboxes at other providers.
- **Cursor pagination** was chosen because the assignment only says "implement pagination" ale rows are added.
- **Timestamps** are set by the application in UTC (ISO 8601 in responses), not by Mongoose.
- **Writes** use majority write concern; the connection fails fast (about 5 seconds) when Mo
- **Where the assignment and a convention disagree**, the assignment wins (for example `403` for a forbidden role and `409` for a duplicate email).
