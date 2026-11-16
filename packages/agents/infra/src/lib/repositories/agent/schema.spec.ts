import * as mongoose from 'mongoose';
import { AgentDo, AgentDoSchema } from './schema';

const AgentModel =
  (mongoose.models[AgentDo.name] as mongoose.Model<AgentDo> | undefined) ??
  mongoose.model<AgentDo>(AgentDo.name, AgentDoSchema);

const validProps = () => ({
  workspaceId: 'workspace_1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  createdAt: new Date('2026-11-13T08:30:00.000Z'),
  updatedAt: new Date('2026-11-13T08:30:00.000Z'),
});

describe('AgentDo schema', () => {
  it('maps to the "agents" collection', () => {
    expect(AgentModel.collection.name).toBe('agents');
  });

  it('accepts a fully populated agent', async () => {
    await expect(new AgentModel(validProps()).validate()).resolves.toBeUndefined();
  });

  it.each(['workspaceId', 'name', 'email', 'createdAt', 'updatedAt'] as const)(
    'rejects an agent without %s',
    async (field) => {
      const props: Partial<ReturnType<typeof validProps>> = validProps();
      delete props[field];

      await expect(new AgentModel(props).validate()).rejects.toMatchObject({
        errors: { [field]: expect.anything() },
      });
    },
  );

  it('generates an ObjectId _id and exposes it as a string id', () => {
    const agent = new AgentModel(validProps());

    expect(agent._id).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(agent.id).toBe(agent._id.toString());
  });

  it('stores workspaceId as a plain string, not an ObjectId', () => {
    const agent = new AgentModel({ ...validProps(), workspaceId: 'workspace_1' });

    expect(agent.workspaceId).toBe('workspace_1');
  });

  it('keeps timestamps as Date values and does not auto-generate them', () => {
    expect(AgentDoSchema.get('timestamps')).toBeFalsy();
    expect(new AgentModel(validProps()).createdAt).toBeInstanceOf(Date);
  });

  it('enforces email uniqueness per workspace with a compound unique index', () => {
    expect(AgentDoSchema.indexes()).toContainEqual([
      { workspaceId: 1, email: 1 },
      expect.objectContaining({ unique: true }),
    ]);
  });

  it('indexes the list query: workspace, newest first, _id tiebreaker', () => {
    expect(AgentDoSchema.indexes()).toContainEqual([
      { workspaceId: 1, createdAt: -1, _id: -1 },
      expect.anything(),
    ]);
  });
});
