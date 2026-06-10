// ./sidekick/src/serverless/index.js
/**
 * Portfolio Sidekick Serverless Engine Gateway
 * Exposes clean, unified local modules for database, quantitative indicators,
 * and public stock queries.
 *
 * Created by: Roy Dawson IV
 */

export { localDb } from './database';
export * from './advisor';
export * from './robinhood';
export * from './strength';
export * from './news';
export {
  fetchCongressTrades,
  formatCongressTradeDate,
  formatCongressSyncStatus,
  DEFAULT_TRACKED_INSIDERS,
  STOCK_ACT_MAX_LAG_DAYS,
  CONGRESS_CACHE_TTL_MS,
} from './congressTrades';
export {
  checkForAppUpdate,
  openUpdateDownload,
  copyUpdateDownloadUrl,
  getPreferredUpdateUrl,
  detectUpdatePlatform,
  isNewerVersion,
} from './updateChecker';
