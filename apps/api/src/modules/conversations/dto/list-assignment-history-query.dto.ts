import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Query string of `GET /conversations/:id/assignment-history`.
 *
 * The workspace comes from the auth context, and the global validation pipe
 * rejects any parameter not declared here with 400. These checks catch wrong
 * types; the allowed `limit` range and cursor contents are validated by the domain.
 */
export class ListAssignmentHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;

  /** Opaque token from the `next` field of a previous response. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  next?: string;

  /** Opaque token from the `previous` field of a previous response. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  previous?: string;
}
