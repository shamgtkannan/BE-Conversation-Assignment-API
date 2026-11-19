import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { InvalidPageRequestError } from '@shared/core';
import { AgentEmailAlreadyExistsError, AgentNotFoundError, InvalidAgentError } from 'agents-domain';
import {
  AssignedAgentNotFoundError,
  AssignmentNotPermittedError,
  AssignmentRequestNotSentError,
  ConversationClosedError,
  ConversationConcurrentModificationError,
  ConversationNotFoundError,
  InvalidConversationError,
} from 'conversations-domain';

interface JsonResponse {
  status(code: number): { json(body: unknown): void };
}

type DomainError =
  | InvalidAgentError
  | InvalidConversationError
  | InvalidPageRequestError
  | AgentNotFoundError
  | ConversationNotFoundError
  | AgentEmailAlreadyExistsError
  | AssignmentNotPermittedError
  | AssignedAgentNotFoundError
  | ConversationClosedError
  | ConversationConcurrentModificationError
  | AssignmentRequestNotSentError;

/** Maps each domain error to its HTTP status and the matching reason phrase. */
const statusOf = (exception: DomainError): [number, string] => {
  if (
    exception instanceof AgentNotFoundError ||
    exception instanceof ConversationNotFoundError ||
    exception instanceof AssignedAgentNotFoundError
  ) {
    return [HttpStatus.NOT_FOUND, 'Not Found'];
  }
  if (
    exception instanceof AgentEmailAlreadyExistsError ||
    exception instanceof ConversationClosedError ||
    exception instanceof ConversationConcurrentModificationError
  ) {
    return [HttpStatus.CONFLICT, 'Conflict'];
  }
  if (exception instanceof AssignmentNotPermittedError) return [HttpStatus.FORBIDDEN, 'Forbidden'];
  if (exception instanceof AssignmentRequestNotSentError) {
    return [HttpStatus.SERVICE_UNAVAILABLE, 'Service Unavailable'];
  }
  return [HttpStatus.BAD_REQUEST, 'Bad Request'];
};

/**
 * Translates domain errors into HTTP responses so controllers never catch.
 * The body has the same shape as Nest's built-in HTTP errors.
 *
 * - {@link InvalidAgentError}, {@link InvalidConversationError} and
 *   {@link InvalidPageRequestError} become 400.
 * - {@link AssignmentNotPermittedError} becomes 403.
 * - {@link AssignmentRequestNotSentError} becomes 503; why it failed is logged, never shown.
 * - {@link AgentNotFoundError}, {@link ConversationNotFoundError} and
 *   {@link AssignedAgentNotFoundError} become 404.
 * - {@link AgentEmailAlreadyExistsError}, {@link ConversationClosedError} and
 *   {@link ConversationConcurrentModificationError} become 409.
 *
 * Anything else is not caught here and falls through to Nest's default 500.
 */
@Catch(
  InvalidAgentError,
  InvalidConversationError,
  InvalidPageRequestError,
  AgentNotFoundError,
  ConversationNotFoundError,
  AgentEmailAlreadyExistsError,
  AssignmentNotPermittedError,
  AssignedAgentNotFoundError,
  ConversationClosedError,
  ConversationConcurrentModificationError,
  AssignmentRequestNotSentError,
)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: DomainError, host: ArgumentsHost): void {
    const [statusCode, error] = statusOf(exception);
    if (exception instanceof AssignmentRequestNotSentError) {
      this.logger.warn(`Assignment request not sent: ${String(exception.cause)}`);
    }

    host
      .switchToHttp()
      .getResponse<JsonResponse>()
      .status(statusCode)
      .json({ statusCode, message: exception.message, error });
  }
}
