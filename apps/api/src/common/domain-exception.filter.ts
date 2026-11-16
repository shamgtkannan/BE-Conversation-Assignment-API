import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import {
  AgentEmailAlreadyExistsError,
  InvalidAgentError,
  InvalidPageRequestError,
} from 'agents-domain';

interface JsonResponse {
  status(code: number): { json(body: unknown): void };
}

type DomainError = InvalidAgentError | InvalidPageRequestError | AgentEmailAlreadyExistsError;

/**
 * Translates domain errors into HTTP responses so controllers never catch.
 * The body has the same shape as Nest's built-in HTTP errors.
 *
 * - {@link InvalidAgentError} and {@link InvalidPageRequestError} become 400.
 * - {@link AgentEmailAlreadyExistsError} becomes 409.
 *
 * Anything else is not caught here and falls through to Nest's default 500.
 */
@Catch(InvalidAgentError, InvalidPageRequestError, AgentEmailAlreadyExistsError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const [statusCode, error] =
      exception instanceof AgentEmailAlreadyExistsError
        ? [HttpStatus.CONFLICT, 'Conflict']
        : [HttpStatus.BAD_REQUEST, 'Bad Request'];

    host
      .switchToHttp()
      .getResponse<JsonResponse>()
      .status(statusCode)
      .json({ statusCode, message: exception.message, error });
  }
}
