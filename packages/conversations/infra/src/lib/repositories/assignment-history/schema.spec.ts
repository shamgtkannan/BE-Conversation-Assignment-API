import * as mongoose from 'mongoose';
import { ASSIGNMENT_ACTIONS } from 'conversations-domain';
import { AssignmentHistoryDo, AssignmentHistoryDoSchema } from './schema';
import { assignmentHistoryValidator } from './validator';

const Model =
  (mongoose.models[AssignmentHistoryDo.name] as mongoose.Model<AssignmentHistoryDo> | undefined) ??
  mongoose.model<AssignmentHistoryDo>(AssignmentHistoryDo.name, AssignmentHistoryDoSchema);

const at = new Date('2026-11-13T09:00:00.000Z');

const assignedLine = () => ({
  eventId: 'event_1',
  workspaceId: 'workspace_1',
  conversationId: '65f1a2b3c4d5e6f708091a2b',
  action: 'assigned',
  newAgentId: '65f1a2b3c4d5e6f708091a2c',
  performedBy: 'user_1',
  createdAt: at,
  version: 1,
});

const unassignedLine = () => ({
  eventId: 'event_2',
  workspaceId: 'workspace_1',
  conversationId: '65f1a2b3c4d5e6f708091a2b',
  action: 'unassigned',
  previousAgentId: '65f1a2b3c4d5e6f708091a2c',
  performedBy: 'user_2',
  createdAt: at,
  version: 2,
});

describe('AssignmentHistoryDo schema', () => {
  it('maps to the "assignment_history" collection', () => {
    expect(Model.collection.name).toBe('assignment_history');
  });

  describe('validation', () => {
    it('accepts an assigned line', async () => {
      await expect(new Model(assignedLine()).validate()).resolves.toBeUndefined();
    });

    it('accepts a reassignment line, which names both agents', async () => {
      await expect(
        new Model({ ...assignedLine(), previousAgentId: '65f1a2b3c4d5e6f708091a2d' }).validate(),
      ).resolves.toBeUndefined();
    });

    it('accepts an unassigned line', async () => {
      await expect(new Model(unassignedLine()).validate()).resolves.toBeUndefined();
    });

    it.each(['eventId', 'workspaceId', 'conversationId', 'action', 'performedBy', 'createdAt', 'version'] as const)(
      'rejects a line without %s',
      async (field) => {
        const props: Partial<ReturnType<typeof assignedLine>> = assignedLine();
        delete props[field];

        await expect(new Model(props).validate()).rejects.toMatchObject({
          errors: { [field]: expect.anything() },
        });
      },
    );

    it.each(['reassigned', 'ASSIGNED', ''])('rejects the action %j', async (action) => {
      await expect(new Model({ ...assignedLine(), action }).validate()).rejects.toMatchObject({
        errors: { action: expect.anything() },
      });
    });
  });

  it('stores the time as a Date and does not auto-generate timestamps', () => {
    expect(AssignmentHistoryDoSchema.get('timestamps')).toBeFalsy();
    expect(new Model(assignedLine()).createdAt).toBeInstanceOf(Date);
  });

  it('stores only the listed fields: no Mongoose version key', () => {
    expect(AssignmentHistoryDoSchema.get('versionKey')).toBe(false);
  });

  describe('indexes', () => {
    it('refuses a second line for the same event: eventId is unique', () => {
      expect(AssignmentHistoryDoSchema.indexes()).toContainEqual([
        { eventId: 1 },
        expect.objectContaining({ unique: true }),
      ]);
    });

    it("serves one conversation's list: workspace, conversation, newest first, _id tiebreaker", () => {
      expect(AssignmentHistoryDoSchema.indexes()).toContainEqual([
        { workspaceId: 1, conversationId: 1, createdAt: -1, _id: -1 },
        expect.anything(),
      ]);
    });

    it('has no other unique index', () => {
      const unique = AssignmentHistoryDoSchema.indexes().filter(([, options]) => options.unique);

      expect(unique).toHaveLength(1);
    });
  });
});

describe('assignment history collection validator', () => {
  const schema = assignmentHistoryValidator.$jsonSchema as {
    required: string[];
    properties: Record<string, { enum?: string[] }>;
  };

  it('describes exactly the fields of the Mongoose schema, so the two cannot drift apart', () => {
    expect(Object.keys(schema.properties).sort()).toEqual(
      Object.keys(AssignmentHistoryDoSchema.paths).sort(),
    );
  });

  it('requires exactly the fields the Mongoose schema requires', () => {
    expect([...schema.required].sort()).toEqual(AssignmentHistoryDoSchema.requiredPaths().sort());
  });

  it('allows exactly the actions the domain defines', () => {
    expect([...(schema.properties['action'].enum ?? [])].sort()).toEqual([...ASSIGNMENT_ACTIONS].sort());
  });
});
