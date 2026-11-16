import { ValidationPipe } from '@nestjs/common';

/**
 * Request validation shared by the real app and the HTTP tests: unknown fields
 * (for example a `workspaceId` in a body) are rejected with 400, and bodies are
 * turned into DTO instances.
 */
export const createValidationPipe = (): ValidationPipe =>
  new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
