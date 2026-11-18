import { IConversationEntity } from 'conversations-domain';
import { InMemoryConversationRepository } from './in-memory-conversation.repository';

/**
 * Test double that makes a race happen on purpose, without timing tricks: the
 * first `parties` reads wait until all of them have asked, so every racer holds
 * the same version before any of them saves. Later reads are not held.
 */
export class BarrierConversationRepository extends InMemoryConversationRepository {
  private arrived = 0;
  private release!: () => void;
  private readonly allArrived = new Promise<void>((resolve) => (this.release = resolve));

  constructor(private readonly parties = 2) {
    super();
  }

  override async findById(workspaceId: string, id: string): Promise<IConversationEntity | null> {
    const found = await super.findById(workspaceId, id);
    if (++this.arrived >= this.parties) this.release();
    await this.allArrived;
    return found;
  }
}
