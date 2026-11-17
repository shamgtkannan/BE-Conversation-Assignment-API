import { GetAgentUseCase } from 'agents-application';
import { AgentNotFoundError, IAgentEntity } from 'agents-domain';
import { AgentsBackedAgentLookup } from './agents-backed-agent-lookup';

const agentId = '65f1a2b3c4d5e6f708091a2c';
const agent: IAgentEntity = {
  id: agentId,
  workspaceId: 'workspace_1',
  name: 'Ada',
  email: 'ada@example.com',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AgentsBackedAgentLookup', () => {
  const execute = jest.fn();
  const lookup = new AgentsBackedAgentLookup({ execute } as unknown as GetAgentUseCase);

  beforeEach(() => execute.mockReset());

  it('says yes when the agents context finds the agent, asking inside the workspace', async () => {
    execute.mockResolvedValue(agent);

    expect(await lookup.exists('workspace_1', agentId)).toBe(true);
    expect(execute).toHaveBeenCalledWith({ workspaceId: 'workspace_1', id: agentId });
  });

  it('says no when the agent does not exist, or belongs to another workspace', async () => {
    execute.mockRejectedValue(new AgentNotFoundError(agentId));

    expect(await lookup.exists('workspace_1', agentId)).toBe(false);
  });

  it('lets unexpected failures through instead of answering no', async () => {
    execute.mockRejectedValue(new Error('database down'));

    await expect(lookup.exists('workspace_1', agentId)).rejects.toThrow('database down');
  });
});
