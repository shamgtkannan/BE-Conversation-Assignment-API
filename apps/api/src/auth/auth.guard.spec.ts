import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { ROLES } from './auth-context';

const validHeaders = () => ({
  'x-user-id': 'user_123',
  'x-workspace-id': 'workspace_1',
  'x-role': 'manager',
});

const contextFor = (request: AuthenticatedRequest) =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

describe('AuthGuard', () => {
  const guard = new AuthGuard();

  it('lets a request with valid headers through and attaches the auth context', () => {
    const request: AuthenticatedRequest = { headers: validHeaders() };

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect(request.auth).toEqual({
      userId: 'user_123',
      workspaceId: 'workspace_1',
      role: 'manager',
    });
  });

  it.each(ROLES)('accepts the %s role', (role) => {
    const request: AuthenticatedRequest = {
      headers: { ...validHeaders(), 'x-role': role },
    };

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect(request.auth?.role).toBe(role);
  });

  it.each(['x-user-id', 'x-workspace-id', 'x-role'])(
    'rejects a request without %s',
    (header) => {
      const headers: Record<string, string> = validHeaders();
      delete headers[header];

      expect(() => guard.canActivate(contextFor({ headers }))).toThrow(
        UnauthorizedException,
      );
    },
  );

  it.each(['x-user-id', 'x-workspace-id', 'x-role'])(
    'rejects a blank %s',
    (header) => {
      const headers = { ...validHeaders(), [header]: '   ' };

      expect(() => guard.canActivate(contextFor({ headers }))).toThrow(
        UnauthorizedException,
      );
    },
  );

  it.each(['owner', 'ADMIN', 'superuser'])('rejects the unknown role "%s"', (role) => {
    const headers = { ...validHeaders(), 'x-role': role };

    expect(() => guard.canActivate(contextFor({ headers }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a repeated header sent as several values', () => {
    const headers = { ...validHeaders(), 'x-user-id': ['user_1', 'user_2'] };

    expect(() => guard.canActivate(contextFor({ headers }))).toThrow(
      UnauthorizedException,
    );
  });

  it('does not attach an auth context when it rejects', () => {
    const request: AuthenticatedRequest = { headers: {} };

    expect(() => guard.canActivate(contextFor(request))).toThrow();
    expect(request.auth).toBeUndefined();
  });
});
