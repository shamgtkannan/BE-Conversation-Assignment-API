import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthContext, ROLES, Role } from './auth-context';

/** Request carrying the authenticated caller once {@link AuthGuard} has run. */
export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  auth?: AuthContext;
}

/** A header counts only when it was sent once and is not blank. */
const readHeader = (
  headers: AuthenticatedRequest['headers'],
  name: string,
): string => {
  const value = headers[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new UnauthorizedException(`Missing or invalid ${name} header`);
  }
  return value.trim();
};

/**
 * Mock authentication guard
 *
 * Reads `x-user-id`, `x-workspace-id` and `x-role`, answers 401 when any is
 * missing or the role is unknown, and otherwise attaches an {@link AuthContext}
 * to the request for `@CurrentAuth()`. It checks identity only; whether a role
 * may perform an action is decided by the use cases (403).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const userId = readHeader(request.headers, 'x-user-id');
    const workspaceId = readHeader(request.headers, 'x-workspace-id');
    const role = readHeader(request.headers, 'x-role');

    if (!(ROLES as readonly string[]).includes(role)) {
      throw new UnauthorizedException('Missing or invalid x-role header');
    }

    request.auth = { userId, workspaceId, role: role as Role };
    return true;
  }
}
