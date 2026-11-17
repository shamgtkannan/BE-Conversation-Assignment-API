import { decodeCursor, encodeCursor } from './cursor';
import { buildPage } from './page';
import { PageRequest } from './page-request';

/** What a page needs of its rows: an id and a creation time (any entity has both). */
interface Row {
  id: string;
  createdAt: Date;
  name: string;
}

/** Agent number `n`: a higher number means created later, so it is listed first. */
const agent = (n: number): Row => ({
  id: n.toString(16).padStart(24, '0'),
  name: `Agent ${n}`,
  createdAt: new Date(Date.UTC(2026, 10, 13, 8, n)),
});

/** Agents `from` down to `to`: newest first, the order of the list. */
const newestFirst = (from: number, to: number): Row[] =>
  Array.from({ length: from - to + 1 }, (_, i) => agent(from - i));

const names = (items: Row[]) => items.map((a) => a.name);
const positionOf = (a: Row) => ({ createdAt: a.createdAt, id: a.id });
const tokenFor = (a: Row) => encodeCursor(positionOf(a));

describe('buildPage', () => {
  describe('first page', () => {
    const request = () => PageRequest.create({ limit: 3 });

    it('returns every row when they fit, with no neighbours', () => {
      const page = buildPage(newestFirst(2, 1), request());

      expect(names(page.items)).toEqual(['Agent 2', 'Agent 1']);
      expect(page).toMatchObject({
        hasNext: false,
        next: null,
        hasPrevious: false,
        previous: null,
      });
    });

    it('treats exactly `limit` rows as the last page', () => {
      const page = buildPage(newestFirst(3, 1), request());

      expect(page.items).toHaveLength(3);
      expect(page.hasNext).toBe(false);
      expect(page.next).toBeNull();
    });

    it('drops the extra row and points `next` at the last returned agent', () => {
      const page = buildPage(newestFirst(4, 1), request());

      expect(names(page.items)).toEqual(['Agent 4', 'Agent 3', 'Agent 2']);
      expect(page.hasNext).toBe(true);
      expect(decodeCursor(page.next as string, 'next')).toEqual(positionOf(agent(2)));
      expect(page.hasPrevious).toBe(false);
      expect(page.previous).toBeNull();
    });
  });

  describe('next page (older agents)', () => {
    const request = () => PageRequest.create({ limit: 2, next: tokenFor(agent(4)) });

    it('can go back: `previous` points at the first returned agent', () => {
      const page = buildPage(newestFirst(3, 2), request());

      expect(names(page.items)).toEqual(['Agent 3', 'Agent 2']);
      expect(page.hasPrevious).toBe(true);
      expect(decodeCursor(page.previous as string, 'previous')).toEqual(positionOf(agent(3)));
    });

    it('reports the end of the list when no extra row came back', () => {
      const page = buildPage(newestFirst(3, 2), request());

      expect(page.hasNext).toBe(false);
      expect(page.next).toBeNull();
    });

    it('reports more when an extra row came back', () => {
      const page = buildPage(newestFirst(3, 1), request());

      expect(names(page.items)).toEqual(['Agent 3', 'Agent 2']);
      expect(page.hasNext).toBe(true);
      expect(decodeCursor(page.next as string, 'next')).toEqual(positionOf(agent(2)));
    });
  });

  describe('previous page (newer agents)', () => {
    const request = () => PageRequest.create({ limit: 2, previous: tokenFor(agent(4)) });

    // The repository reads backward: oldest first, starting next to the cursor.
    it('returns the rows newest first again, whatever order they were fetched in', () => {
      const page = buildPage([agent(5), agent(6)], request());

      expect(names(page.items)).toEqual(['Agent 6', 'Agent 5']);
    });

    it('can go forward again: `next` points at the last returned (oldest) agent', () => {
      const page = buildPage([agent(5), agent(6)], request());

      expect(page.hasNext).toBe(true);
      expect(decodeCursor(page.next as string, 'next')).toEqual(positionOf(agent(5)));
    });

    it('drops the extra, farthest row and points `previous` at the first returned agent', () => {
      const page = buildPage([agent(5), agent(6), agent(7)], request());

      expect(names(page.items)).toEqual(['Agent 6', 'Agent 5']);
      expect(page.hasPrevious).toBe(true);
      expect(decodeCursor(page.previous as string, 'previous')).toEqual(positionOf(agent(6)));
    });

    it('reports the start of the list when no extra row came back', () => {
      const page = buildPage([agent(5), agent(6)], request());

      expect(page.hasPrevious).toBe(false);
      expect(page.previous).toBeNull();
    });
  });

  describe('empty result', () => {
    it.each<[string, () => PageRequest]>([
      ['first', () => PageRequest.create({})],
      ['next', () => PageRequest.create({ next: tokenFor(agent(1)) })],
      ['previous', () => PageRequest.create({ previous: tokenFor(agent(9)) })],
    ])('has no items and no neighbours on a %s request', (_direction, makeRequest) => {
      const page = buildPage([], makeRequest());

      expect(page).toEqual({
        items: [],
        hasNext: false,
        next: null,
        hasPrevious: false,
        previous: null,
      });
    });
  });

  it('walks the whole list forward and back through the tokens it produces', () => {
    const all = newestFirst(5, 1);
    // Stand-in for the repository: reads forward in list order, or backward oldest first.
    const fetch = (request: PageRequest): Row[] => {
      const at = all.findIndex((a) => a.id === request.cursor?.id);
      if (request.direction === 'previous') {
        return all.slice(Math.max(0, at - request.fetchSize), at).reverse();
      }
      const start = request.direction === 'first' ? 0 : at + 1;
      return all.slice(start, start + request.fetchSize);
    };
    const read = (input: { next?: string; previous?: string }) => {
      const request = PageRequest.create({ limit: 2, ...input });
      return buildPage(fetch(request), request);
    };

    const first = read({});
    const second = read({ next: first.next as string });
    const third = read({ next: second.next as string });

    expect([names(first.items), names(second.items), names(third.items)]).toEqual([
      ['Agent 5', 'Agent 4'],
      ['Agent 3', 'Agent 2'],
      ['Agent 1'],
    ]);
    expect(third.hasNext).toBe(false);

    const back = read({ previous: third.previous as string });
    expect(names(back.items)).toEqual(['Agent 3', 'Agent 2']);
    expect(back.hasNext).toBe(true);

    const backAgain = read({ previous: back.previous as string });
    expect(names(backAgain.items)).toEqual(['Agent 5', 'Agent 4']);
    expect(backAgain.hasPrevious).toBe(false);
  });
});
