/** Roles that may assign and unassign conversations; every other role gets a 403. */
export const ASSIGNING_ROLES: readonly string[] = ['admin', 'manager'];
