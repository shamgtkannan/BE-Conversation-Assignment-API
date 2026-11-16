/** Conversation ids are MongoDB ObjectIds written as 24 lowercase hexadecimal characters. */
const CONVERSATION_ID_FORMAT = /^[0-9a-f]{24}$/;

/**
 * True when `value` is a well-formed conversation id. Strict on purpose: one
 * canonical spelling, so uppercase or padded input is rejected rather than
 * guessed at. This says nothing about whether such a conversation exists.
 */
export const isConversationId = (value: string): boolean => CONVERSATION_ID_FORMAT.test(value);
