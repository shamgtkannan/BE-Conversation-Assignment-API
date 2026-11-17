import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { InvalidPageRequestError } from '@shared/core';
import { AgentEmailAlreadyExistsError, AgentNotFoundError, InvalidAgentError } from 'agents-domain';
import {
  AssignedAgentNotFoundError,
  AssignmentNotPermittedError,
  ConversationClosedError,
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
  | ConversationClosedError;

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
    exception instanceof ConversationClosedError
  ) {
    return [HttpStatus.CONFLICT, 'Conflict'];
  }
  if (exception instanceof AssignmentNotPermittedError) return [HttpStatus.FORBIDDEN, 'Forbidden'];
  return [HttpStatus.BAD_REQUEST, 'Bad Request'];
};

/**
 * Translates domain errors into HTTP responses so controllers never catch.
 * The body has the same shape as Nest's built-in HTTP errors.
 *
 * - {@link InvalidAgentError}, {@link InvalidConversationError} and
 *   {@link InvalidPageRequestError} become 400.
 * - {@link AssignmentNotPermittedError} becomes 403.
 * - {@link AgentNotFoundError}, {@link ConversationNotFoundError} and
 *   {@link AssignedAgentNotFoundError} become 404.
 * - {@link AgentEmailAlreadyExistsError} and {@link ConversationClosedError} become 409.
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
)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const [statusCode, error] = statusOf(exception);

    host
      .switchToHttp()
      .getResponse<JsonResponse>()
      .status(statusCode)
      .json({ statusCode, message: exception.message, error });
  }
}
