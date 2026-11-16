# BE-Conversation-Assignment-API
Conversation Assignment JSON-RPC REST API built with Nx, NestJS, Jest, Docker, MongoDB, TDD.

## Setup
```sh
nvm use                 # Node 20 (.nvmrc)
npm install
cp .env.example .env    # PORT, MONGODB_URI
docker compose up -d    # local MongoDB
```

## Run
`npx nx serve api` (http://localhost:3000)

## Test / lint
```sh
npx nx run-many -t test
npx nx run-many -t lint
```
Integration tests use `mongodb-memory-server` (no real database needed).

## Layout
`packages/{agents,conversations}/{domain,application,infra}` + `apps/api/src/modules/{agents,conversations}`.
Layer/scope boundaries are enforced via Nx tags in `eslint.config.mjs`.
