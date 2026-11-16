import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { AgentEmailAlreadyExistsError, InvalidAgentError } from 'agents-domain';

/**
 * Translates domain errors into HTTP responses so controllers never catch.
 * Not implemented yet: answers 500 for everything.
 */
@Catch(InvalidAgentError, AgentEmailAlreadyExistsError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(_exception: Error, host: ArgumentsHost): void {
    host.switchToHttp().getResponse().status(500).json({});
  }
}
