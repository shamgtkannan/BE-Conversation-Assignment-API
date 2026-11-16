import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

/** Request carrying the authenticated caller once {@link AuthGuard} has run. */
export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  auth?: import('./auth-context').AuthContext;
}

/** Mock authentication guard. Not implemented yet: lets every request through. */
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return true;
  }
}
