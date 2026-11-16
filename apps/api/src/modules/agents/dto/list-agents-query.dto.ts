import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Query string of `GET /agents`.
 *
 * Only paging parameters exist: the workspace comes from the auth context, and
 * the global validation pipe rejects any other parameter with 400. These checks
 * catch wrong types; the allowed range of `limit` and the cursor contents are
 * validated by the domain.
 */
export class ListAgentsQueryDto {
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
