# shared-core

Code both contexts need and that belongs to neither: the entity id check (`isEntityId`), and cursor pagination (`PageRequest`, cursor tokens, `Page`, `buildPage`) with `InvalidPageRequestError`.

It imports nothing from NestJS, MongoDB or any context, so any library may depend on it. Import it as `@shared/core`.

## Tests

```sh
npx nx test shared-core
```
