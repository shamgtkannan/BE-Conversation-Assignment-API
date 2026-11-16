/** Agent ids are MongoDB ObjectIds written as 24 lowercase hexadecimal characters. */
const AGENT_ID_FORMAT = /^[0-9a-f]{24}$/;

/**
 * True when `value` is a well-formed agent id. Strict on purpose: one canonical
 * spelling, so uppercase or padded input is rejected rather than guessed at.
 * This says nothing about whether such an agent exists.
 */
export const isAgentId = (value: string): boolean => AGENT_ID_FORMAT.test(value);
