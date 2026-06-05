// ./frontend/src/plugins/robinhood-session/index.ts
import { registerPlugin } from '@capacitor/core';

export interface SessionPayload {
  token_type: string;
  access_token: string;
  refresh_token: string;
  device_token: string;
}

export interface PendingChallenge {
  device_token: string;
  login_payload: Record<string, unknown>;
  workflow_id: string;
  machine_id: string;
  challenge_type: string;
  challenge_id: string | null;
  inquiries_url: string;
}

export interface RobinhoodSessionPlugin {
  saveSession(options: {
    profileId: number;
    session: SessionPayload;
    username: string;
  }): Promise<void>;
  loadSession(options: { profileId: number }): Promise<{ session?: SessionPayload }>;
  saveChallenge(options: { profileId: number; pending: PendingChallenge }): Promise<void>;
  loadChallenge(options: { profileId: number }): Promise<{ pending?: PendingChallenge }>;
  clearChallenge(options: { profileId: number }): Promise<void>;
  getUsername(options: { profileId: number }): Promise<{ username?: string }>;
  wipe(options: { profileId: number }): Promise<void>;
}

export const RobinhoodSession = registerPlugin<RobinhoodSessionPlugin>('RobinhoodSession', {
  web: () => import('./web').then((m) => new m.RobinhoodSessionWeb()),
});
