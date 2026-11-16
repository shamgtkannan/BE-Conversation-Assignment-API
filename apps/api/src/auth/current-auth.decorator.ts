import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { AuthContext } from './auth-context';
import { AuthenticatedRequest } from './auth.guard';

/**
 * Injects the caller's {@link AuthContext} into a controller parameter.
 * Only valid on routes covered by {@link AuthGuard}, which sets it.
 */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext | undefined =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().auth,
);
