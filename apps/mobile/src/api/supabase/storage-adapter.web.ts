/**
 * Session storage in a web browser (Metro picks this file for web builds).
 *
 * There is no keychain in a browser, and expo-secure-store has no web
 * implementation, so the native adapter made every sign-in on the web fail
 * after the password was accepted. sessionStorage is used rather than
 * localStorage: the session ends when the tab is closed, which suits the
 * platform admin console on a shared computer.
 */

function store(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    // Storage blocked by the browser: the user simply stays signed out.
    return null;
  }
}

export const secureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    return store()?.getItem(key) ?? null;
  },

  async setItem(key: string, value: string): Promise<void> {
    store()?.setItem(key, value);
  },

  async removeItem(key: string): Promise<void> {
    store()?.removeItem(key);
  },
};
