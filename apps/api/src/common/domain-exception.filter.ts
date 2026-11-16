import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { AgentEmailAlreadyExistsError, InvalidAgentError } from 'agents-domain';

interface JsonResponse {
  status(code: number): { json(body: unknown): void };
}

/**
 * Translates domain errors into HTTP responses so controllers never catch.
 * The body has the same shape as Nest's built-in HTTP errors.
 *
 * - {@link InvalidAgentError} becomes 400.
 * - {@link AgentEmailAlreadyExistsError} becomes 409.
 *
 * Anything else is not caught here and falls through to Nest's default 500.
 */
@Catch(InvalidAgentError, AgentEmailAlreadyExistsError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: InvalidAgentError | AgentEmailAlreadyExistsError, host: ArgumentsHost): void {
    const [statusCode, error] =
      exception instanceof InvalidAgentError
        ? [HttpStatus.BAD_REQUEST, 'Bad Request']
        : [HttpStatus.CONFLICT, 'Conflict'];

    host
      .switchToHttp()
      .getResponse<JsonResponse>()
      .status(statusCode)
      .json({ statusCode, message: exception.message, error });
  }
}
