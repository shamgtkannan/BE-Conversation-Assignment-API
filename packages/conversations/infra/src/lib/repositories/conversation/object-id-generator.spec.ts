import { ObjectIdGenerator } from './object-id-generator';

describe('ObjectIdGenerator', () => {
  const generator = new ObjectIdGenerator();

  it('produces 24 lowercase hexadecimal characters', () => {
    expect(generator.next()).toMatch(/^[0-9a-f]{24}$/);
  });

  it('produces a different id every time', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generator.next()));

    expect(ids.size).toBe(1000);
  });
});
