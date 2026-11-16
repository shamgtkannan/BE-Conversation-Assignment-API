import { CONVERSATION_STATUSES, ConversationStatus } from 'conversations-domain';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Body of `POST /conversations`.
 *
 * `workspaceId` and the assignment fields are deliberately absent: the
 * workspace comes from the auth context and a new conversation is unassigned.
 * The global validation pipe rejects any field not declared here with 400.
 * These checks catch missing or wrongly typed input; the domain applies the
 * finer rules (a subject of only spaces is still blank).
 */
export class CreateConversationDto {
  @IsString()
  @IsNotEmpty()
  subject!: string;

  /** `open` or `closed`; defaults to `open` when omitted. */
  @IsOptional()
  @IsIn(CONVERSATION_STATUSES)
  status?: ConversationStatus;
}
