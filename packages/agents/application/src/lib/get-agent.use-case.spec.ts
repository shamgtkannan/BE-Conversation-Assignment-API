import { Agent, AgentNotFoundError, InvalidAgentError } from 'agents-domain';
import { GetAgentUseCase } from './get-agent.use-case';
import { InMemoryAgentRepository } from './testing/in-memory-agent.repository';

const id = (n: number) => n.toString(16).padStart(24, '0');

const seed = (repository: InMemoryAgentRepository, n: number, workspaceId = 'workspace_1') =>
  repository.save(
    Agent.create({
      id: id(n),
      workspaceId,
      name: `Agent ${n}`,
      email: `agent${n}@example.com`,
      now: new Date(Date.UTC(2026, 10, 13, 8, n)),
    }),
  );

describe('GetAgentUseCase', () => {
  let repository: InMemoryAgentRepository;
  let useCase: GetAgentUseCase;

  beforeEach(async () => {
    repository = new InMemoryAgentRepository();
    useCase = new GetAgentUseCase(repository);
    await seed(repository, 1);
    await seed(repository, 2);
  });

  it('returns the agent with the given id', async () => {
    const agent = await useCase.execute({ workspaceId: 'workspace_1', id: id(2) });

    expect(agent).toMatchObject({
      id: id(2),
      workspaceId: 'workspace_1',
      name: 'Agent 2',
      email: 'agent2@example.com',
    });
  });

  it('reports an unknown id as not found', async () => {
    await expect(useCase.execute({ workspaceId: 'workspace_1', id: id(99) })).rejects.toThrow(
      AgentNotFoundError,
    );
    await expect(useCase.execute({ workspaceId: 'workspace_1', id: id(99) })).rejects.toThrow(
      expect.objectContaining({ id: id(99) }),
    );
  });

  it('reports an agent of another workspace exactly like a missing one', async () => {
    await seed(repository, 3, 'workspace_2');

    const otherWorkspace = useCase.execute({ workspaceId: 'workspace_1', id: id(3) });
    const missing = useCase.execute({ workspaceId: 'workspace_1', id: id(98) });

    await expect(otherWorkspace).rejects.toThrow(AgentNotFoundError);
    await expect(missing).rejects.toThrow(AgentNotFoundError);
  });

  it('lets the owning workspace read its own agent', async () => {
    await seed(repository, 3, 'workspace_2');

    const agent = await useCase.execute({ workspaceId: 'workspace_2', id: id(3) });

    expect(agent.name).toBe('Agent 3');
  });

  it.each(['abc', '', '65F1A2B3C4D5E6F708091A2B', 'agent_456'])(
    'rejects the malformed id %j without reading the repository',
    async (malformed) => {
      const findById = jest.spyOn(repository, 'findById');

      await expect(
        useCase.execute({ workspaceId: 'workspace_1', id: malformed }),
      ).rejects.toThrow(expect.objectContaining({ name: 'InvalidAgentError', field: 'id' }));
      expect(findById).not.toHaveBeenCalled();
    },
  );

  it('uses InvalidAgentError for a malformed id', async () => {
    await expect(useCase.execute({ workspaceId: 'workspace_1', id: 'abc' })).rejects.toThrow(
      InvalidAgentError,
    );
  });
});
