// ./frontend/src/plugins/robinhood-session/web.ts
import { WebPlugin } from '@capacitor/core';
import type { RobinhoodSessionPlugin } from './index';

const challengeKey = (profileId: number) => `rh_challenge_${profileId}`;
const sessionKey = (profileId: number) => `rh_session_${profileId}`;
const usernameKey = (profileId: number) => `rh_username_${profileId}`;

export class RobinhoodSessionWeb extends WebPlugin implements RobinhoodSessionPlugin {
  async saveSession({ profileId, session, username }) {
    localStorage.setItem(sessionKey(profileId), JSON.stringify(session));
    if (username) localStorage.setItem(usernameKey(profileId), username);
  }

  async loadSession({ profileId }) {
    const raw = localStorage.getItem(sessionKey(profileId));
    if (!raw) return {};
    return { session: JSON.parse(raw) };
  }

  async saveChallenge({ profileId, pending }) {
    localStorage.setItem(challengeKey(profileId), JSON.stringify(pending));
  }

  async loadChallenge({ profileId }) {
    const raw = localStorage.getItem(challengeKey(profileId));
    if (!raw) return {};
    return { pending: JSON.parse(raw) };
  }

  async clearChallenge({ profileId }) {
    localStorage.removeItem(challengeKey(profileId));
  }

  async getUsername({ profileId }) {
    const username = localStorage.getItem(usernameKey(profileId));
    return username ? { username } : {};
  }

  async wipe({ profileId }) {
    localStorage.removeItem(sessionKey(profileId));
    localStorage.removeItem(usernameKey(profileId));
    localStorage.removeItem(challengeKey(profileId));
  }
}
