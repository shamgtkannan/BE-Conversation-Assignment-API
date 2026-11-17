import { InvalidPageRequestError } from '../exceptions/invalid-page-request.error';
import { Cursor, decodeCursor, encodeCursor } from './cursor';

const cursor: Cursor = {
  createdAt: new Date('2026-11-13T08:30:00.123Z'),
  id: '65f1a2b3c4d5e6f708091a2b',
};

const toToken = (value: unknown): string =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

/**
 * A real token with its n-th value replaced. Works on the decoded JSON without
 * knowing its key names, so the tests do not pin down the token format.
 */
const withValue = (index: number, value: unknown): string => {
  const json = JSON.parse(Buffer.from(encodeCursor(cursor), 'base64url').toString());
  const keys = Object.keys(json);
  return toToken({ ...json, [keys[index]]: value });
};

describe('cursor token', () => {
  it('round-trips a position, keeping milliseconds', () => {
    expect(decodeCursor(encodeCursor(cursor), 'next')).toEqual(cursor);
  });

  it('is a URL-safe token that does not expose the position as plain text', () => {
    const token = encodeCursor(cursor);

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain(cursor.id);
  });

  it('gives different tokens for different positions', () => {
    const other = { ...cursor, id: '65f1a2b3c4d5e6f708091a2c' };

    expect(encodeCursor(other)).not.toBe(encodeCursor(cursor));
  });

  describe('rejects a malformed token', () => {
    it.each<[string, () => string]>([
      ['an empty string', () => ''],
      ['text that is not a token', () => 'not a token!'],
      ['valid base64 that is not JSON', () => toToken('hello')],
      ['JSON null', () => toToken('null')],
      ['a JSON array', () => toToken('[]')],
      ['an empty JSON object', () => toToken({})],
      ['a token whose first value is not a date', () => withValue(0, 'zzz')],
      ['a token whose first value is a number', () => withValue(0, 123)],
      ['a token whose second value is not an id', () => withValue(1, 'zzz')],
      ['a token whose second value is a number', () => withValue(1, 123)],
    ])('%s', (_label, makeToken) => {
      expect(() => decodeCursor(makeToken(), 'next')).toThrow(InvalidPageRequestError);
    });

    it.each(['next', 'previous'] as const)('and names the %s parameter in the error', (field) => {
      expect(() => decodeCursor('garbage!', field)).toThrow(
        expect.objectContaining({ field }),
      );
    });
  });
});
