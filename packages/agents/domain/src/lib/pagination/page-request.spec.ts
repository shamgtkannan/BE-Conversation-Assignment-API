import { InvalidPageRequestError } from '../exceptions/invalid-page-request.error';
import { AgentCursor, encodeCursor } from './agent-cursor';
import { DEFAULT_LIMIT, MAX_LIMIT, PageRequest } from './page-request';

const cursor: AgentCursor = {
  createdAt: new Date('2026-11-13T08:30:00.000Z'),
  id: '65f1a2b3c4d5e6f708091a2b',
};
const token = () => encodeCursor(cursor);

describe('PageRequest.create', () => {
  describe('with no parameters', () => {
    it('reads the first page with the default limit', () => {
      const request = PageRequest.create({});

      expect(request.limit).toBe(DEFAULT_LIMIT);
      expect(request.direction).toBe('first');
      expect(request.cursor).toBeUndefined();
    });

    it('defaults to 20 and allows at most 100', () => {
      expect(DEFAULT_LIMIT).toBe(20);
      expect(MAX_LIMIT).toBe(100);
    });
  });

  describe('limit', () => {
    it.each([1, 10, 100])('accepts %d', (limit) => {
      expect(PageRequest.create({ limit }).limit).toBe(limit);
    });

    it.each([0, -1, 101, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects %p', (limit) => {
      expect(() => PageRequest.create({ limit })).toThrow(InvalidPageRequestError);
      expect(() => PageRequest.create({ limit })).toThrow(
        expect.objectContaining({ field: 'limit' }),
      );
    });

    it('fetches one row more than the limit so a following page can be detected', () => {
      expect(PageRequest.create({ limit: 10 }).fetchSize).toBe(11);
      expect(PageRequest.create({}).fetchSize).toBe(DEFAULT_LIMIT + 1);
    });
  });

  describe('cursors', () => {
    it('reads forward from the `next` token', () => {
      const request = PageRequest.create({ next: token() });

      expect(request.direction).toBe('next');
      expect(request.cursor).toEqual(cursor);
    });

    it('reads backward from the `previous` token', () => {
      const request = PageRequest.create({ previous: token() });

      expect(request.direction).toBe('previous');
      expect(request.cursor).toEqual(cursor);
    });

    it('combines a cursor with a limit', () => {
      const request = PageRequest.create({ next: token(), limit: 5 });

      expect(request.limit).toBe(5);
      expect(request.direction).toBe('next');
    });

    it('rejects asking for both directions at once', () => {
      expect(() => PageRequest.create({ next: token(), previous: token() })).toThrow(
        InvalidPageRequestError,
      );
    });

    it.each(['next', 'previous'] as const)('rejects a malformed %s token', (field) => {
      expect(() => PageRequest.create({ [field]: 'garbage!' })).toThrow(
        expect.objectContaining({ name: 'InvalidPageRequestError', field }),
      );
    });

    it('rejects an empty token instead of treating it as no cursor', () => {
      expect(() => PageRequest.create({ next: '' })).toThrow(InvalidPageRequestError);
    });
  });
});
