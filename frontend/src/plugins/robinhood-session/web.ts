// ./frontend/src/plugins/robinhood-session/web.ts
import { WebPlugin } from '@capacitor/core';
import type { RobinhoodSessionPlugin } from './index';

const challengeKey = (profileId: number) => `rh_challenge_${profileId}`;
const sessionKey = (profileId: number) => `rh_session_${profileId}`;
const usernameKey = (profileId: number) => `rh_username_${profileId}`;

const VAULT_FILENAME = 'robinhood_vault.json';

type VaultFile = {
  sessions: Record<string, string>;
  challenges: Record<string, string>;
  usernames: Record<string, string>;
};

function isTauriShellSync() {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}

async function isTauriRuntime() {
  if (isTauriShellSync()) return true;
  try {
    const { isTauri } = await import('@tauri-apps/api/core');
    return isTauri();
  } catch {
    return false;
  }
}

async function readVaultFile(): Promise<VaultFile> {
  if (await isTauriRuntime()) {
    const { readStorageFile } = await import('../../serverless/storagePaths.js');
    const raw = await readStorageFile(VAULT_FILENAME);
    if (!raw) return { sessions: {}, challenges: {}, usernames: {} };
    try {
      const text = new TextDecoder().decode(raw);
      return JSON.parse(text);
    } catch {
      return { sessions: {}, challenges: {}, usernames: {} };
    }
  }
  const raw = localStorage.getItem(VAULT_FILENAME);
  if (!raw) return { sessions: {}, challenges: {}, usernames: {} };
  try {
    return JSON.parse(raw);
  } catch {
    return { sessions: {}, challenges: {}, usernames: {} };
  }
}

async function writeVaultFile(vault: VaultFile) {
  const payload = JSON.stringify(vault);
  if (await isTauriRuntime()) {
    try {
      const { writeStorageFile } = await import('../../serverless/storagePaths.js');
      await writeStorageFile(VAULT_FILENAME, new TextEncoder().encode(payload));
      return;
    } catch (err) {
      console.warn('[RobinhoodSession] Portable vault write failed; using WebView storage fallback.', err);
    }
  }
  localStorage.setItem(VAULT_FILENAME, payload);
}

export class RobinhoodSessionWeb extends WebPlugin implements RobinhoodSessionPlugin {
  async saveSession({ profileId, session, username }) {
    const vault = await readVaultFile();
    vault.sessions[String(profileId)] = JSON.stringify(session);
    if (username) vault.usernames[String(profileId)] = username;
    await writeVaultFile(vault);
    localStorage.setItem(sessionKey(profileId), JSON.stringify(session));
    if (username) localStorage.setItem(usernameKey(profileId), username);
  }

  async loadSession({ profileId }) {
    const vault = await readVaultFile();
    const raw = vault.sessions[String(profileId)] || localStorage.getItem(sessionKey(profileId));
    if (!raw) return {};
    return { session: JSON.parse(raw) };
  }

  async saveChallenge({ profileId, pending }) {
    const vault = await readVaultFile();
    vault.challenges[String(profileId)] = JSON.stringify(pending);
    await writeVaultFile(vault);
    localStorage.setItem(challengeKey(profileId), JSON.stringify(pending));
  }

  async loadChallenge({ profileId }) {
    const vault = await readVaultFile();
    const raw = vault.challenges[String(profileId)] || localStorage.getItem(challengeKey(profileId));
    if (!raw) return {};
    return { pending: JSON.parse(raw) };
  }

  async clearChallenge({ profileId }) {
    const vault = await readVaultFile();
    delete vault.challenges[String(profileId)];
    await writeVaultFile(vault);
    localStorage.removeItem(challengeKey(profileId));
  }

  async getUsername({ profileId }) {
    const vault = await readVaultFile();
    const username = vault.usernames[String(profileId)] || localStorage.getItem(usernameKey(profileId));
    return username ? { username } : {};
  }

  async wipe({ profileId }) {
    const vault = await readVaultFile();
    delete vault.sessions[String(profileId)];
    delete vault.usernames[String(profileId)];
    delete vault.challenges[String(profileId)];
    await writeVaultFile(vault);
    localStorage.removeItem(sessionKey(profileId));
    localStorage.removeItem(usernameKey(profileId));
    localStorage.removeItem(challengeKey(profileId));
  }
}
