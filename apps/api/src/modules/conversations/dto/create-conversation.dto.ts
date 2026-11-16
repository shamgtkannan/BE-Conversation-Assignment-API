import { ConversationStatus } from 'conversations-domain';

/**
 * Body of `POST /conversations`. Validation rules are not declared yet.
 * `workspaceId` and the assignment fields are deliberately absent: the
 * workspace comes from the auth context and a new conversation is unassigned.
 */
export class CreateConversationDto {
  subject!: string;
  status?: ConversationStatus;
}
