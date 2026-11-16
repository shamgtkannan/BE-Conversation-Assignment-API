# BE-Conversation-Assignment-API

Conversation Assignment REST API built with Nx, NestJS, Mongoose, Jest and MongoDB, following
domain-driven design and hexagonal architecture, developed test-first (TDD).

Implemented so far: mock authentication, `POST /agents`, `GET /agents` and `GET /agents/:id`.

## Prerequisites

- Node 20 (`nvm use` reads `.nvmrc`)
- Docker Desktop, running
- The MongoDB compose setup at `../docker/compose/mongodb-8.0` (a 3-node replica set)

## 1. Install

```sh
nvm use
npm install
cp .env.example .env
```

`.env` is git-ignored. The defaults match the compose setup below; change them only if you
change the compose file.

## 2. Map the MongoDB host names (once per machine)

The replica set announces its members as `mongodb1`, `mongodb2` and `mongodb3`, so your machine
must resolve those names. Add this to `/etc/hosts` (needs `sudo`), unless the lines are already there:

```
127.0.0.1 mongodb1 mongodb2 mongodb3
```

Check with `grep mongodb /etc/hosts`.

## 3. Start MongoDB

Open Docker Desktop and wait until it says it is running, then:

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

Right after start-up all three can show `SECONDARY` for up to about 30 seconds while the
election finishes. Wait and run the command again. To block until a primary exists:

```sh
until docker exec mongodb-80-1 mongosh --port 27801 --quiet \
  --eval 'quit(db.hello().isWritablePrimary || db.hello().primary ? 0 : 1)' >/dev/null 2>&1; do sleep 2; done; echo ready
```

If it is still all `SECONDARY` after a minute, look at `health` and `lastHeartbeatMessage`
per member in `rs.status()`; a heartbeat error means the containers cannot reach each other.

Stop it with `docker compose -f ../docker/compose/mongodb-8.0/docker-compose.yml down`.
That setup has no volumes, so removing the containers deletes all data.

## 4. Serve the API

```sh
npx nx serve api
```

The API listens on http://localhost:3000. It refuses to start without `MONGODB_HOSTS`,
`MONGODB_DATABASE` and `MONGODB_REPLICA_SET`, and fails after about 5 seconds if MongoDB is not reachable.

### Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | HTTP port | `3000` |
| `MONGODB_HOSTS` | Comma-separated `host:port` list | none (required) |
| `MONGODB_DATABASE` | Database name | none (required) |
| `MONGODB_REPLICA_SET` | Replica set name | none (required) |
| `MONGODB_POOL_SIZE` | Connection pool size | `10` |
| `MONGODB_TEST_HOSTS`, `MONGODB_TEST_REPLICA_SET`, `MONGODB_TEST_DATABASE` | Integration tests only. The database name must end in `_test`; each suite adds its own suffix to it. | the compose setup, `assignment_test` |

## 5. Try it

Every request needs three headers, which stand in for real authentication (`x-role` is
`admin`, `manager` or `agent`):

```sh
curl -i -X POST http://localhost:3000/agents \
  -H 'content-type: application/json' \
  -H 'x-user-id: user_123' \
  -H 'x-workspace-id: workspace_1' \
  -H 'x-role: manager' \
  -d '{"name": "Ada Lovelace", "email": "Ada@Example.com"}'
```

Expected: `201` with `{ id, name, email: "ada@example.com", workspaceId, createdAt, updatedAt }`.
Sending the same email again in the same workspace returns `409`; an invalid body returns `400`;
missing headers return `401`.

List the workspace's agents, newest first, two per page:

```sh
curl -s 'http://localhost:3000/agents?limit=2' \
  -H 'x-user-id: user_123' -H 'x-workspace-id: workspace_1' -H 'x-role: agent'
```

The response is `{ items, hasNext, next, hasPrevious, previous }`. Pass a returned token back as
`?next=<token>` for older agents or `?previous=<token>` for newer ones. `limit` is 1 to 100 (default 20).
A bad limit or token returns `400`. All three roles may list.

Read one agent by id (use an `id` from the responses above):

```sh
curl -i http://localhost:3000/agents/<id> \
  -H 'x-user-id: user_123' -H 'x-workspace-id: workspace_1' -H 'x-role: agent'
```

Returns `200` with the agent. A malformed id (anything but 24 lowercase hex characters) returns `400`.
An id that does not exist in your workspace returns `404`, and so does an id that belongs to another
workspace, so one workspace cannot probe another's ids.

Look at the stored document:

```sh
docker exec mongodb-80-1 mongosh --port 27801 --quiet assignment \
  --eval 'db.agents.find().toArray()'
```

## Test and lint

```sh
npx nx run-many -t test            # unit tests, no database needed
npx nx run-many -t lint
npx nx integration agents-infra    # repository against real MongoDB
npx nx integration api             # whole API against real MongoDB
```

The two `integration` targets need MongoDB running (step 3). Each suite uses its own database
(`assignment_agents_infra_test` and `assignment_api_test`, derived from `MONGODB_TEST_DATABASE`) and drops
it when finished, so the suites are safe to run in parallel.

## Layout

`packages/{agents,conversations}/{domain,application,infra}` plus `apps/api/src/modules/{agents,conversations}`.
Layer and context boundaries are enforced with Nx tags in `eslint.config.mjs`;
`npx nx graph` shows the real dependency graph.
