// ./frontend/src/serverless/db/sqliteEngine.js
/**
 * In-process SQLite engine (sql.js WASM) with debounced cross-platform persistence.
 * Exposes sync query helpers after async init — safe for apiRouter and localDb.
 */

import initSqlJs from 'sql.js';
import { SCHEMA_SQL } from './schema.js';
import { loadDatabaseBlob, saveDatabaseBlob } from './persist.js';
import { migrateFromLocalStorage } from './migrateFromLocalStorage.js';

let sqlDb = null;
let initPromise = null;
let persistTimer = null;

function schedulePersist() {
  if (!sqlDb) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    try {
      const data = sqlDb.export();
      await saveDatabaseBlob(data);
    } catch (err) {
      console.error('[SQLite] Persist failed:', err);
    }
  }, 400);
}

function applySchema(db) {
  db.exec(SCHEMA_SQL);
}

export async function initDatabase() {
  if (sqlDb) return sqlDb;
  const SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' });
  const blob = await loadDatabaseBlob();
  sqlDb = blob ? new SQL.Database(blob) : new SQL.Database();
  applySchema(sqlDb);
  migrateFromLocalStorage(sqlDb);
  schedulePersist();
  return sqlDb;
}

export function ensureDatabaseReady() {
  if (!initPromise) initPromise = initDatabase();
  return initPromise;
}

export function isDatabaseReady() {
  return Boolean(sqlDb);
}

function bindParams(stmt, params = []) {
  if (!params.length) return;
  stmt.bind(params);
}

export function run(sql, params = []) {
  if (!sqlDb) throw new Error('Database not initialized');
  sqlDb.run(sql, params);
  schedulePersist();
}

export function queryAll(sql, params = []) {
  if (!sqlDb) throw new Error('Database not initialized');
  const stmt = sqlDb.prepare(sql);
  bindParams(stmt, params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

export function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows[0] || null;
}

export async function flushDatabase() {
  if (!sqlDb) return;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  await saveDatabaseBlob(sqlDb.export());
}
