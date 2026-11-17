# shared-core

Code both contexts (agents and conversations) need and that belongs to neither: for now, cursor
pagination (`PageRequest`, cursor tokens, `buildPage`) and the error for a bad page request.

It imports nothing from NestJS, MongoDB or any context, so any library may depend on it.
Import it as `@shared/core`.

## Building

Run `nx build shared-core` to build the library.

## Running unit tests

Run `nx test shared-core` to execute the unit tests via [Jest](https://jestjs.io).
