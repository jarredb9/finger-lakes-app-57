import { useSyncStore } from '../syncStore';
import { webcrypto } from 'node:crypto';

// Mock idb-keyval
jest.mock('idb-keyval', () => ({
  get: jest.fn(),
  set: jest.fn().mockResolvedValue(undefined),
}));

// Polyfill webcrypto for Node environment
if (!global.crypto || !global.crypto.subtle) {
  Object.defineProperty(global, 'crypto', {
    value: webcrypto,
    writable: true,
    configurable: true,
  });
}

describe('SyncStore', () => {
  const userId = 'test-user-id';

  beforeEach(() => {
    useSyncStore.getState().reset();
    jest.clearAllMocks();
  });

  it('should add an item to the queue and encrypt it', async () => {
    const payload = { wineryId: 1, rating: 5 };
    const type = 'log_visit';
    
    await useSyncStore.getState().addMutation({
      type,
      payload,
      userId
    });

    const queue = useSyncStore.getState().queue;
    expect(queue.length).toBe(1);
    expect(queue[0].type).toBe(type);
    expect(typeof queue[0].encryptedPayload).toBe('string');
    
    // Verify it's actually encrypted (can't read payload directly)
    expect(queue[0].encryptedPayload).not.toContain('wineryId');
  });

  it('should decrypt a mutation payload', async () => {
    const payload = { wineryId: 1 };
    await useSyncStore.getState().addMutation({
      type: 'log_visit',
      payload,
      userId
    });

    const item = useSyncStore.getState().queue[0];
    const decrypted = await useSyncStore.getState().getDecryptedPayload(item, userId);
    expect(decrypted).toEqual(payload);
  });

  it('should remove an item from the queue', async () => {
    await useSyncStore.getState().addMutation({
      type: 'log_visit',
      payload: { id: 1 },
      userId
    });

    const id = useSyncStore.getState().queue[0].id;
    useSyncStore.getState().removeMutation(id);
    
    expect(useSyncStore.getState().queue.length).toBe(0);
  });

  it('should persist to idb-keyval (mocked)', async () => {
    // This will depend on how we mock idb-keyval, 
    // but the store should trigger a save on add/remove
  });
});
