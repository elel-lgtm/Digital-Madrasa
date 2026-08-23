import * as SecureStore from 'expo-secure-store';

/**
 * Session storage backed by the device keychain / keystore.
 *
 * Tokens must not sit in AsyncStorage — that is plain, world-readable app
 * storage, and on a rooted or backed-up device it hands over a live session.
 * SecureStore uses Keychain on iOS and EncryptedSharedPreferences on Android.
 *
 * The complication: SecureStore rejects values over 2048 bytes on Android, and
 * a Supabase session (access token + refresh token + user payload) regularly
 * exceeds that. So values are split across numbered chunks and reassembled on
 * read. The chunk count lives in the base key, which is what lets a shrinking
 * session clean up the chunks it no longer needs.
 */

const CHUNK_SIZE = 1800;
const COUNT_PREFIX = '__chunks:';

async function clearChunks(key: string, count: number): Promise<void> {
  const removals: Promise<void>[] = [];
  for (let i = 0; i < count; i += 1) {
    removals.push(SecureStore.deleteItemAsync(`${key}.${i}`).catch(() => undefined));
  }
  await Promise.all(removals);
}

async function readChunkCount(key: string): Promise<number> {
  const head = await SecureStore.getItemAsync(key).catch(() => null);
  if (!head || !head.startsWith(COUNT_PREFIX)) return 0;
  const parsed = Number(head.slice(COUNT_PREFIX.length));
  return Number.isFinite(parsed) ? parsed : 0;
}

export const secureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    try {
      const head = await SecureStore.getItemAsync(key);
      if (head === null) return null;

      // Short values are stored whole, with no chunk header.
      if (!head.startsWith(COUNT_PREFIX)) return head;

      const count = Number(head.slice(COUNT_PREFIX.length));
      const parts: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const part = await SecureStore.getItemAsync(`${key}.${i}`);
        // A missing chunk means the session is corrupt; treat it as absent so
        // the user is asked to sign in again rather than handed a broken token.
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join('');
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    const previousCount = await readChunkCount(key);

    if (value.length <= CHUNK_SIZE) {
      await clearChunks(key, previousCount);
      await SecureStore.setItemAsync(key, value);
      return;
    }

    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }

    await Promise.all(
      chunks.map((chunk, index) => SecureStore.setItemAsync(`${key}.${index}`, chunk)),
    );
    // Written last: until the header lands, a partial write reads as absent
    // rather than as a truncated session.
    await SecureStore.setItemAsync(key, `${COUNT_PREFIX}${chunks.length}`);

    if (previousCount > chunks.length) {
      await clearChunks(key, previousCount);
      await Promise.all(
        chunks.map((chunk, index) => SecureStore.setItemAsync(`${key}.${index}`, chunk)),
      );
    }
  },

  async removeItem(key: string): Promise<void> {
    const count = await readChunkCount(key);
    await clearChunks(key, count);
    await SecureStore.deleteItemAsync(key).catch(() => undefined);
  },
};
