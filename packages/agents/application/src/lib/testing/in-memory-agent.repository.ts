import {
  Agent,
  AgentEmailAlreadyExistsError,
  IAgentEntity,
  PageRequest,
} from 'agents-domain';
import { AgentRepository } from '../ports';

/** List order: newest first, the id breaks ties. */
const newestFirst = (a: IAgentEntity, b: IAgentEntity): number =>
  b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/**
 * Test double for {@link AgentRepository}. It follows the same rules as the
 * real one: a unique email per workspace, and the ordering contract of `list`.
 */
export class InMemoryAgentRepository implements AgentRepository {
  readonly saved: Agent[] = [];

  async save(agent: Agent): Promise<void> {
    const taken = this.saved.some(
      (a) => a.workspaceId === agent.workspaceId && a.email === agent.email,
    );
    if (taken) {
      throw new AgentEmailAlreadyExistsError(agent.email);
    }
    this.saved.push(agent);
  }

  async findById(workspaceId: string, id: string): Promise<IAgentEntity | null> {
    return this.saved.find((a) => a.workspaceId === workspaceId && a.id === id) ?? null;
  }

  async list(workspaceId: string, request: PageRequest): Promise<IAgentEntity[]> {
    const ordered = this.saved.filter((a) => a.workspaceId === workspaceId).sort(newestFirst);
    const { cursor, direction } = request;

    if (direction === 'previous' && cursor) {
      const newer = ordered.filter(
        (a) =>
          a.createdAt.getTime() > cursor.createdAt.getTime() ||
          (a.createdAt.getTime() === cursor.createdAt.getTime() && a.id > cursor.id),
      );
      return newer.reverse().slice(0, request.fetchSize);
    }
    const rows =
      direction === 'next' && cursor
        ? ordered.filter(
            (a) =>
              a.createdAt.getTime() < cursor.createdAt.getTime() ||
              (a.createdAt.getTime() === cursor.createdAt.getTime() && a.id < cursor.id),
          )
        : ordered;
    return rows.slice(0, request.fetchSize);
  }
}
