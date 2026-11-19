import { AssignmentRequested } from 'conversations-domain';
import { AssignmentRequestPublisher } from '../ports';

/** Test double for {@link AssignmentRequestPublisher}: remembers every request, in order. */
export class InMemoryAssignmentRequestPublisher implements AssignmentRequestPublisher {
  readonly published: AssignmentRequested[] = [];

  async publish(request: AssignmentRequested): Promise<void> {
    this.published.push(request);
  }
}
