import { ArgumentsHost } from '@nestjs/common';
import { FILTER_CATCH_EXCEPTIONS } from '@nestjs/common/constants';
import { InvalidConversationError } from 'conversations-domain';
import {
  AgentEmailAlreadyExistsError,
  AgentNotFoundError,
  InvalidAgentError,
  InvalidPageRequestError,
} from 'agents-domain';
import { DomainExceptionFilter } from './domain-exception.filter';

/** A fake HTTP host that records the status and body the filter writes. */
const fakeHost = () => {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
};

describe('DomainExceptionFilter', () => {
  const filter = new DomainExceptionFilter();

  it.each<[string, Error, number, string]>([
    ['an invalid conversation', new InvalidConversationError('subject', 'Subject is blank'), 400, 'Bad Request'],
    ['an invalid agent', new InvalidAgentError('name', 'Name is blank'), 400, 'Bad Request'],
    ['an invalid page request', new InvalidPageRequestError('limit', 'Limit is out of range'), 400, 'Bad Request'],
    ['a missing agent', new AgentNotFoundError('65f1a2b3c4d5e6f708091a2b'), 404, 'Not Found'],
    ['a duplicate agent email', new AgentEmailAlreadyExistsError('ada@example.com'), 409, 'Conflict'],
  ])('answers %s with %i', (_label, exception, statusCode, error) => {
    const { host, status, json } = fakeHost();

    filter.catch(exception as never, host);

    expect(status).toHaveBeenCalledWith(statusCode);
    expect(json).toHaveBeenCalledWith({ statusCode, message: exception.message, error });
  });

  it('passes the domain error message through to the client', () => {
    const { host, json } = fakeHost();

    filter.catch(new InvalidConversationError('status', 'Status must be open or closed'), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Status must be open or closed' }),
    );
  });

  it('is registered for exactly the domain errors, so anything else falls through to 500', () => {
    const caught: unknown[] = Reflect.getMetadata(FILTER_CATCH_EXCEPTIONS, DomainExceptionFilter);

    expect(caught).toEqual(
      expect.arrayContaining([
        InvalidConversationError,
        InvalidAgentError,
        InvalidPageRequestError,
        AgentNotFoundError,
        AgentEmailAlreadyExistsError,
      ]),
    );
    expect(caught).toHaveLength(5);
    expect(caught).not.toContain(Error);
  });
});
