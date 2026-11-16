import { AgentEmailAlreadyExistsError, InvalidAgentError } from 'agents-domain';
import { CreateAgentUseCase } from './create-agent.use-case';
import { Clock, IdGenerator } from './ports';
import { InMemoryAgentRepository } from './testing/in-memory-agent.repository';

const now = new Date('2026-11-13T08:30:00.000Z');
const clock: Clock = { now: () => now };

describe('CreateAgentUseCase', () => {
  let repository: InMemoryAgentRepository;
  let useCase: CreateAgentUseCase;

  beforeEach(() => {
    repository = new InMemoryAgentRepository();
    let counter = 0;
    const ids: IdGenerator = { next: () => `agent_${++counter}` };
    useCase = new CreateAgentUseCase(repository, ids, clock);
  });

  const command = (overrides = {}) => ({
    workspaceId: 'workspace_1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    ...overrides,
  });

  it('creates and saves an agent in the given workspace', async () => {
    const agent = await useCase.execute(command());

    expect(agent).toMatchObject({
      id: 'agent_1',
      workspaceId: 'workspace_1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      createdAt: now,
      updatedAt: now,
    });
    expect(repository.saved).toHaveLength(1);
    expect(repository.saved[0]).toBe(agent);
  });

  it('saves the normalised email', async () => {
    const agent = await useCase.execute(command({ email: '  ADA@Example.com ' }));

    expect(agent.email).toBe('ada@example.com');
  });

  it('gives every agent its own id', async () => {
    const first = await useCase.execute(command());
    const second = await useCase.execute(command({ email: 'grace@example.com' }));

    expect(first.id).not.toBe(second.id);
  });

  it('saves nothing when the data breaks a domain rule', async () => {
    await expect(useCase.execute(command({ name: '  ' }))).rejects.toThrow(InvalidAgentError);
    await expect(useCase.execute(command({ email: 'nope' }))).rejects.toThrow(InvalidAgentError);

    expect(repository.saved).toHaveLength(0);
  });

  it('rejects an email already used in the same workspace, whatever its letter case', async () => {
    await useCase.execute(command());

    await expect(useCase.execute(command({ email: 'ADA@example.com' }))).rejects.toThrow(
      AgentEmailAlreadyExistsError,
    );
    expect(repository.saved).toHaveLength(1);
  });

  it('allows the same email in a different workspace', async () => {
    await useCase.execute(command());

    const other = await useCase.execute(command({ workspaceId: 'workspace_2' }));

    expect(other.workspaceId).toBe('workspace_2');
    expect(repository.saved).toHaveLength(2);
  });
});
