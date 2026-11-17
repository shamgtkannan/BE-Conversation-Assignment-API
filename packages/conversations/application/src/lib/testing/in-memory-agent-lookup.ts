import { AgentLookup } from '../ports';

/** Test double for {@link AgentLookup}: knows exactly the agents added to it. */
export class InMemoryAgentLookup implements AgentLookup {
  private readonly known = new Set<string>();

  /** Makes `agentId` an existing agent of `workspaceId`. */
  add(workspaceId: string, agentId: string): void {
    this.known.add(`${workspaceId}:${agentId}`);
  }

  async exists(workspaceId: string, agentId: string): Promise<boolean> {
    return this.known.has(`${workspaceId}:${agentId}`);
  }
}
