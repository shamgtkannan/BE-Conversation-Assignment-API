/**
 * Body of `POST /agents`. Validation rules are not declared yet.
 * `workspaceId` is deliberately absent: it comes from the auth context.
 */
export class CreateAgentDto {
  name!: string;
  email!: string;
}
