import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import {
  AgentEmailAlreadyExistsError,
  AgentNotFoundError,
  InvalidAgentError,
  InvalidPageRequestError,
} from 'agents-domain';
import { ConversationNotFoundError, InvalidConversationError } from 'conversations-domain';

interface JsonResponse {
  status(code: number): { json(body: unknown): void };
}

type DomainError =
  | InvalidAgentError
  | InvalidConversationError
  | InvalidPageRequestError
  | AgentNotFoundError
  | ConversationNotFoundError
  | AgentEmailAlreadyExistsError;

/** Maps each domain error to its HTTP status and the matching reason phrase. */
const statusOf = (exception: DomainError): [number, string] => {
  if (exception instanceof AgentNotFoundError || exception instanceof ConversationNotFoundError) {
    return [HttpStatus.NOT_FOUND, 'Not Found'];
  }
  if (exception instanceof AgentEmailAlreadyExistsError) return [HttpStatus.CONFLICT, 'Conflict'];
  return [HttpStatus.BAD_REQUEST, 'Bad Request'];
};

/**
 * Translates domain errors into HTTP responses so controllers never catch.
 * The body has the same shape as Nest's built-in HTTP errors.
 *
 * - {@link InvalidAgentError}, {@link InvalidConversationError} and
 *   {@link InvalidPageRequestError} become 400.
 * - {@link AgentNotFoundError} and {@link ConversationNotFoundError} become 404.
 * - {@link AgentEmailAlreadyExistsError} becomes 409.
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
