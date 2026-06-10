// ./sidekick/src/plugins/robinhood-session/index.ts
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

export interface HttpRequestResult {
  status: number;
  body: string;
}

export interface RobinhoodLoginResult {
  status: string;
  mode: string;
  message: string;
  challenge_type?: string;
  challenge_issued?: boolean;
  session?: SessionPayload;
}

export interface RobinhoodSessionPlugin {
  httpReset(): Promise<void>;
  robinhoodLogin(options: {
    profileId: number;
    username: string;
    password: string;
    mfaCode?: string | null;
    continueMfa?: boolean;
  }): Promise<RobinhoodLoginResult>;
  httpRequest(options: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string | null;
    jsonBody?: Record<string, unknown> | null;
  }): Promise<HttpRequestResult>;
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
