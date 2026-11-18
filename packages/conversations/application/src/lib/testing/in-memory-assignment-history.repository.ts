import { PageRequest } from '@shared/core';
import { IAssignmentHistoryEntity, NewAssignmentHistoryEntry } from 'conversations-domain';
import { AssignmentHistoryRepository } from '../ports';

/** List order: newest first, the id breaks ties. */
const newestFirst = (a: IAssignmentHistoryEntity, b: IAssignmentHistoryEntity): number =>
  b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/**
 * Test double for {@link AssignmentHistoryRepository}. Like the real one it
 * records each event once and lists one conversation's lines of one workspace.
 */
export class InMemoryAssignmentHistoryRepository implements AssignmentHistoryRepository {
  readonly lines: IAssignmentHistoryEntity[] = [];

  async record(entry: NewAssignmentHistoryEntry): Promise<boolean> {
    if (this.lines.some((line) => line.eventId === entry.eventId)) return false;
    const id = (this.lines.length + 1).toString(16).padStart(24, '0');
    this.lines.push({ ...entry, id });
    return true;
  }

  async list(
    workspaceId: string,
    conversationId: string,
    request: PageRequest,
  ): Promise<IAssignmentHistoryEntity[]> {
    const ordered = this.lines
      .filter((line) => line.workspaceId === workspaceId && line.conversationId === conversationId)
      .sort(newestFirst);
    const { cursor, direction } = request;

    if (direction === 'previous' && cursor) {
      const newer = ordered.filter(
        (line) =>
          line.createdAt.getTime() > cursor.createdAt.getTime() ||
          (line.createdAt.getTime() === cursor.createdAt.getTime() && line.id > cursor.id),
      );
      return newer.reverse().slice(0, request.fetchSize);
    }
    const rows =
      direction === 'next' && cursor
        ? ordered.filter(
            (line) =>
              line.createdAt.getTime() < cursor.createdAt.getTime() ||
              (line.createdAt.getTime() === cursor.createdAt.getTime() && line.id < cursor.id),
          )
        : ordered;
    return rows.slice(0, request.fetchSize);
  }
}
