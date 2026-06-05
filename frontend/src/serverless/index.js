// ./frontend/src/serverless/index.js
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
