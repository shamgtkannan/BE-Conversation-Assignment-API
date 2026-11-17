import { isEntityId } from '@shared/core';

/**
 * True when `value` is a well-formed agent id: an ObjectId written as 24
 * lowercase hexadecimal characters. Strict on purpose: one canonical spelling,
 * so uppercase or padded input is rejected rather than guessed at. This says
 * nothing about whether such an agent exists.
 */
export const isAgentId = (value: string): boolean => isEntityId(value);
