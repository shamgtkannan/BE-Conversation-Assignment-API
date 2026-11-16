import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import {
  AgentEmailAlreadyExistsError,
  AgentNotFoundError,
  InvalidAgentError,
  InvalidPageRequestError,
} from 'agents-domain';

interface JsonResponse {
  status(code: number): { json(body: unknown): void };
}

type DomainError =
  | InvalidAgentError
  | InvalidPageRequestError
  | AgentNotFoundError
  | AgentEmailAlreadyExistsError;

/** Maps each domain error to its HTTP status and the matching reason phrase. */
const statusOf = (exception: DomainError): [number, string] => {
  if (exception instanceof AgentNotFoundError) return [HttpStatus.NOT_FOUND, 'Not Found'];
  if (exception instanceof AgentEmailAlreadyExistsError) return [HttpStatus.CONFLICT, 'Conflict'];
  return [HttpStatus.BAD_REQUEST, 'Bad Request'];
};

/**
 * Translates domain errors into HTTP responses so controllers never catch.
 * The body has the same shape as Nest's built-in HTTP errors.
 *
 * - {@link InvalidAgentError} and {@link InvalidPageRequestError} become 400.
 * - {@link AgentNotFoundError} becomes 404.
 * - {@link AgentEmailAlreadyExistsError} becomes 409.
 *
 * Anything else is not caught here and falls through to Nest's default 500.
 */
@Catch(InvalidAgentError, InvalidPageRequestError, AgentNotFoundError, AgentEmailAlreadyExistsError)
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
