/**
 * Thrown when a caller whose role may not manage assignments tries to assign or
 * unassign a conversation. Only admins and managers may. The API layer maps it
 * to 403.
 */
export class AssignmentNotPermittedError extends Error {
  constructor(readonly role: string) {
    super(`Role "${role}" is not allowed to assign or unassign conversations`);
    this.name = 'AssignmentNotPermittedError';
  }
}
