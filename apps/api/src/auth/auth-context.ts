/** Roles a caller can hold. Only `admin` and `manager` may assign or unassign conversations. */
export const ROLES = ['admin', 'manager', 'agent'] as const;

export type Role = (typeof ROLES)[number];

/**
 * Who is calling and which workspace they act in.
 *
 * Built by the mock {@link AuthGuard} from request headers. Workspace scoping
 * and `assignedBy` always come from here, never from a request body.
 */
export interface AuthContext {
  userId: string;
  workspaceId: string;
  role: Role;
}
