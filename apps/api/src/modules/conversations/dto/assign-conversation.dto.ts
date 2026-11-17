import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Body of `PATCH /conversations/:id/assignment`.
 *
 * Only the agent is named. The workspace and the user who assigns come from
 * the auth context, and the global validation pipe rejects any other field with
 * 400. The id format and the agent's existence are checked by the use case.
 */
export class AssignConversationDto {
  @IsString()
  @IsNotEmpty()
  agentId!: string;
}
