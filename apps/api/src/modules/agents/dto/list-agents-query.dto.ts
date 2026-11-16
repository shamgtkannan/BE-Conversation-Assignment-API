/**
 * Query string of `GET /agents`. Validation rules are not declared yet.
 * Only paging parameters exist: the workspace comes from the auth context.
 */
export class ListAgentsQueryDto {
  limit?: number;
  next?: string;
  previous?: string;
}
