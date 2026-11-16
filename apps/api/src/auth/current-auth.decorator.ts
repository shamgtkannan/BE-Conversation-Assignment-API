import { createParamDecorator } from '@nestjs/common';

/** Injects the caller's `AuthContext` into a controller parameter. Not implemented yet. */
export const CurrentAuth = createParamDecorator(() => undefined);
