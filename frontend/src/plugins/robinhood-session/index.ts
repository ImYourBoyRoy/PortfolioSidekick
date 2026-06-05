// ./frontend/src/plugins/robinhood-session/index.ts
import { registerPlugin } from '@capacitor/core';

export interface LoginResult {
  status: string;
  mode?: string;
  message?: string;
  challenge_type?: string;
}

export interface SyncResult {
  status: string;
  synced_count: number;
  holdings?: Array<{
    ticker: string;
    shares: number;
    avg_buy_price: number;
    current_price: number;
  }>;
}

export interface AuthStatus {
  authenticated: boolean;
  username?: string;
}

export interface RobinhoodSessionPlugin {
  login(options: {
    profileId: number;
    username: string;
    password: string;
    mfaCode?: string | null;
  }): Promise<LoginResult>;
  logout(options: { profileId: number }): Promise<{ status: string; message?: string }>;
  getStatus(options: { profileId: number }): Promise<AuthStatus>;
  syncHoldings(options: { profileId: number }): Promise<SyncResult>;
}

export const RobinhoodSession = registerPlugin<RobinhoodSessionPlugin>('RobinhoodSession', {
  web: () => import('./web').then((m) => new m.RobinhoodSessionWeb()),
});
