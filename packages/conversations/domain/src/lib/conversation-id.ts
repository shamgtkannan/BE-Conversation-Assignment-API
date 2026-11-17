import { isEntityId } from '@shared/core';

/**
 * True when `value` is a well-formed conversation id: an ObjectId written as
 * 24 lowercase hexadecimal characters. Strict on purpose: one canonical
 * spelling, so uppercase or padded input is rejected rather than guessed at.
 * This says nothing about whether such a conversation exists.
 */
export const isConversationId = (value: string): boolean => isEntityId(value);
