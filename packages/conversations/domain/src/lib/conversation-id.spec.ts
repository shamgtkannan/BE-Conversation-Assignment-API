import { isConversationId } from './conversation-id';

describe('isConversationId', () => {
  it.each(['65f1a2b3c4d5e6f708091a2b', '000000000000000000000001', 'ffffffffffffffffffffffff'])(
    'accepts the 24-character lowercase hex string %s',
    (id) => {
      expect(isConversationId(id)).toBe(true);
    },
  );

  it.each([
    ['an empty string', ''],
    ['too short', 'abc'],
    ['23 characters', '65f1a2b3c4d5e6f708091a2'],
    ['25 characters', '65f1a2b3c4d5e6f708091a2b0'],
    ['uppercase hex', '65F1A2B3C4D5E6F708091A2B'],
    ['characters outside hex', 'g5f1a2b3c4d5e6f708091a2b'],
    ['surrounding spaces', ' 65f1a2b3c4d5e6f708091a2b '],
    ['an id in another style', 'conv_123'],
  ])('rejects %s', (_label, id) => {
    expect(isConversationId(id)).toBe(false);
  });
});
