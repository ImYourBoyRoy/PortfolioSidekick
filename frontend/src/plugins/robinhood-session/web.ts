// ./frontend/src/plugins/robinhood-session/web.ts
import { WebPlugin } from '@capacitor/core';
import type { RobinhoodSessionPlugin } from './index';

export class RobinhoodSessionWeb extends WebPlugin implements RobinhoodSessionPlugin {
  async login() {
    return {
      status: 'error',
      message: 'Robinhood login is only available in the native Android app.',
    };
  }
  async logout() {
    return { status: 'success', message: 'No native session on web.' };
  }
  async getStatus() {
    return { authenticated: false };
  }
  async syncHoldings() {
    return { status: 'error', synced_count: 0 };
  }
}
