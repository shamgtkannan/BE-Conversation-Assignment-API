import * as mongoose from 'mongoose';
import { RawConversationChange, StoredConversation, toConversationChange } from './conversation-change.mapper';

const objectId = '65f1a2b3c4d5e6f708091a2b';
const created = new Date('2026-11-13T08:00:00.000Z');
const assignedAt = new Date('2026-11-13T09:00:00.000Z');
const ada = '65f1a2b3c4d5e6f708091a2c';

const stored = (overrides: Partial<StoredConversation> = {}): StoredConversation => ({
  _id: new mongoose.Types.ObjectId(objectId),
  workspaceId: 'workspace_1',
  subject: 'Unable to log in',
  status: 'open',
  createdAt: created,
  updatedAt: created,
  version: 0,
  ...overrides,
});

const assignedDoc = (): StoredConversation =>
  stored({ assignedAgentId: ada, assignedAt, assignedBy: 'user_1', updatedAt: assignedAt, version: 1 });

const raw = (overrides: Partial<RawConversationChange> = {}): RawConversationChange => ({
  _id: { _data: '826AFEAD7E000000022B042C' },
  operationType: 'replace',
  fullDocument: assignedDoc(),
  fullDocumentBeforeChange: stored(),
  ...overrides,
});

describe('toConversationChange', () => {
  it('uses the id of the change as the change id', () => {
    expect(toConversationChange(raw())?.changeId).toBe('826AFEAD7E000000022B042C');
  });

  it('turns the stored documents into plain conversations: id as text, every field kept', () => {
    const change = toConversationChange(raw());

    expect(change?.before).toEqual({
      id: objectId,
      workspaceId: 'workspace_1',
      subject: 'Unable to log in',
      status: 'open',
      createdAt: created,
      updatedAt: created,
      version: 0,
    });
    expect(change?.after).toEqual({
      id: objectId,
      workspaceId: 'workspace_1',
      subject: 'Unable to log in',
      status: 'open',
      assignedAgentId: ada,
      assignedAt,
      assignedBy: 'user_1',
      createdAt: created,
      updatedAt: assignedAt,
      version: 1,
    });
  });

  it('leaves out the assignment fields a document does not have (absent, not null)', () => {
    const change = toConversationChange(raw());

    expect(change?.before).not.toHaveProperty('assignedAgentId');
    expect(change?.before).not.toHaveProperty('assignedAt');
    expect(change?.before).not.toHaveProperty('assignedBy');
  });

  it('reads an assignment that is stored as null as no assignment', () => {
    const withNulls = stored({ assignedAgentId: null as never, assignedAt: null as never, assignedBy: null as never });

    const change = toConversationChange(raw({ fullDocument: withNulls }));

    expect(change?.after).not.toHaveProperty('assignedAgentId');
  });

  it('has no before for an insert, because there was nothing before', () => {
    const change = toConversationChange({
      _id: { _data: 'abc' },
      operationType: 'insert',
      fullDocument: assignedDoc(),
    });

    expect(change).not.toHaveProperty('before');
    expect(change?.after.assignedAgentId).toBe(ada);
  });

  it.each(['update', 'replace'])('reads an %s the same way: it has both documents', (operationType) => {
    const change = toConversationChange(raw({ operationType }));

    expect(change?.before?.version).toBe(0);
    expect(change?.after.version).toBe(1);
  });

  it('counts a document stored before the version existed as version 0', () => {
    const legacy = stored();
    delete (legacy as Partial<StoredConversation>).version;

    const change = toConversationChange(raw({ fullDocument: legacy, fullDocumentBeforeChange: undefined }));

    expect(change?.after.version).toBe(0);
  });

  describe('a change that says nothing about an assignment', () => {
    it('a delete, which has no document after it', () => {
      expect(
        toConversationChange({ _id: { _data: 'abc' }, operationType: 'delete', fullDocumentBeforeChange: stored() }),
      ).toBeNull();
    });

    it('any change that arrives without a document after it', () => {
      expect(toConversationChange({ _id: { _data: 'abc' }, operationType: 'update' })).toBeNull();
    });
  });
});
