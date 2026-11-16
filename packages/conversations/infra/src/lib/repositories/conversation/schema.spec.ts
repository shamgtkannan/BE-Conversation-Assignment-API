import * as mongoose from 'mongoose';
import { ConversationDo, ConversationDoSchema } from './schema';

const ConversationModel =
  (mongoose.models[ConversationDo.name] as mongoose.Model<ConversationDo> | undefined) ??
  mongoose.model<ConversationDo>(ConversationDo.name, ConversationDoSchema);

const at = new Date('2026-11-13T08:30:00.000Z');

const unassigned = () => ({
  workspaceId: 'workspace_1',
  subject: 'Unable to log in',
  status: 'open',
  createdAt: at,
  updatedAt: at,
});

const assigned = () => ({
  ...unassigned(),
  assignedAgentId: '65f1a2b3c4d5e6f708091a2b',
  assignedAt: new Date('2026-11-13T09:00:00.000Z'),
  assignedBy: 'user_123',
});

describe('ConversationDo schema', () => {
  it('maps to the "conversations" collection', () => {
    expect(ConversationModel.collection.name).toBe('conversations');
  });

  describe('validation', () => {
    it('accepts an unassigned conversation', async () => {
      await expect(new ConversationModel(unassigned()).validate()).resolves.toBeUndefined();
    });

    it('accepts an assigned conversation', async () => {
      await expect(new ConversationModel(assigned()).validate()).resolves.toBeUndefined();
    });

    it.each(['workspaceId', 'subject', 'status', 'createdAt', 'updatedAt'] as const)(
      'rejects a conversation without %s',
      async (field) => {
        const props: Partial<ReturnType<typeof unassigned>> = unassigned();
        delete props[field];

        await expect(new ConversationModel(props).validate()).rejects.toMatchObject({
          errors: { [field]: expect.anything() },
        });
      },
    );

    it.each(['open', 'closed'])('accepts the status %s', async (status) => {
      await expect(
        new ConversationModel({ ...unassigned(), status }).validate(),
      ).resolves.toBeUndefined();
    });

    it.each(['pending', 'OPEN', 'archived'])('rejects the status %s', async (status) => {
      await expect(new ConversationModel({ ...unassigned(), status }).validate()).rejects.toMatchObject({
        errors: { status: expect.anything() },
      });
    });
  });

  describe('assignment fields', () => {
    it.each(['assignedAgentId', 'assignedAt', 'assignedBy'] as const)(
      'treat %s as optional',
      async (field) => {
        const props: Partial<ReturnType<typeof assigned>> = assigned();
        delete props[field];

        await expect(new ConversationModel(props).validate()).resolves.toBeUndefined();
      },
    );

    it('stay absent, not null, on an unassigned conversation', () => {
      const stored = new ConversationModel(unassigned()).toObject();

      expect('assignedAgentId' in stored).toBe(false);
      expect('assignedAt' in stored).toBe(false);
      expect('assignedBy' in stored).toBe(false);
    });

    it('keep the assigned agent as a plain string and the time as a Date', () => {
      const conversation = new ConversationModel(assigned());

      expect(conversation.assignedAgentId).toBe('65f1a2b3c4d5e6f708091a2b');
      expect(conversation.assignedAt).toBeInstanceOf(Date);
      expect(conversation.assignedBy).toBe('user_123');
    });
  });

  it('generates an ObjectId _id and exposes it as a string id', () => {
    const conversation = new ConversationModel(unassigned());

    expect(conversation._id).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(conversation.id).toBe(conversation._id.toString());
  });

  it('stores workspaceId as a plain string, not an ObjectId', () => {
    expect(new ConversationModel(unassigned()).workspaceId).toBe('workspace_1');
  });

  it('keeps timestamps as Date values and does not auto-generate them', () => {
    expect(ConversationDoSchema.get('timestamps')).toBeFalsy();
    expect(new ConversationModel(unassigned()).createdAt).toBeInstanceOf(Date);
  });

  describe('indexes', () => {
    it('serves the cursor-paginated list: workspace, newest first, _id tiebreaker', () => {
      expect(ConversationDoSchema.indexes()).toContainEqual([
        { workspaceId: 1, createdAt: -1, _id: -1 },
        expect.anything(),
      ]);
    });

    it('serves the filter by status', () => {
      expect(ConversationDoSchema.indexes()).toContainEqual([
        { workspaceId: 1, status: 1 },
        expect.anything(),
      ]);
    });

    it('serves the filter by assigned agent', () => {
      expect(ConversationDoSchema.indexes()).toContainEqual([
        { workspaceId: 1, assignedAgentId: 1 },
        expect.anything(),
      ]);
    });

    it('has no unique index: many conversations may share a subject', () => {
      const unique = ConversationDoSchema.indexes().filter(([, options]) => options.unique);

      expect(unique).toEqual([]);
    });
  });
});
