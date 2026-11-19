import { enableChangeStreamImages } from './change-stream-images';

describe('enableChangeStreamImages', () => {
  it('asks MongoDB to keep the document before and after every change to the collection', async () => {
    const command = jest.fn().mockResolvedValue({ ok: 1 });

    await enableChangeStreamImages({ command }, 'conversations');

    expect(command).toHaveBeenCalledTimes(1);
    expect(command).toHaveBeenCalledWith({
      collMod: 'conversations',
      changeStreamPreAndPostImages: { enabled: true },
    });
  });

  it('can run again: switching on what is already on is fine', async () => {
    const command = jest.fn().mockResolvedValue({ ok: 1 });

    await enableChangeStreamImages({ command }, 'conversations');
    await enableChangeStreamImages({ command }, 'conversations');

    expect(command).toHaveBeenCalledTimes(2);
  });

  it('names the collection it was given, and no other', async () => {
    const command = jest.fn().mockResolvedValue({ ok: 1 });

    await enableChangeStreamImages({ command }, 'something_else');

    expect(command).toHaveBeenCalledWith(expect.objectContaining({ collMod: 'something_else' }));
  });

  it('passes MongoDB\'s refusal on, so a start without the images does not go unnoticed', async () => {
    const command = jest.fn().mockRejectedValue(new Error('not authorized'));

    await expect(enableChangeStreamImages({ command }, 'conversations')).rejects.toThrow('not authorized');
  });
});
