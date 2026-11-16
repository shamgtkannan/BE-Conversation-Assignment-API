import { Controller, NotImplementedException, Post } from '@nestjs/common';
import { CreateConversationUseCase } from 'conversations-application';
import { ConversationResponse } from './conversation.response';

/** HTTP entry point for conversations. It only delegates; the rules live in the use cases. */
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly createConversationUseCase: CreateConversationUseCase) {}

  /** `POST /conversations`: creates a conversation in the caller's workspace. Not implemented yet. */
  @Post()
  create(): Promise<ConversationResponse> {
    void this.createConversationUseCase;
    throw new NotImplementedException();
  }
}
