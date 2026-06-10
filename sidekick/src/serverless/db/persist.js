// ./sidekick/src/serverless/db/persist.js
/**
 * Cross-platform SQLite blob persistence.
 * - Tauri desktop (default): portable `data/` folder beside the executable
 * - Tauri desktop (AppData mode): place `portfolio_sidekick.portable` absent + use AppData
 * - Capacitor Android: internal DATA directory
 * - Dev/browser: IndexedDB
 */

import {
  getStorageLayout,
  readStorageFile,
  writeStorageFile,
} from '../storagePaths.js';

const DB_FILENAME = 'portfolio_sidekick.db';
const IDB_NAME = 'portfolio_sidekick_secure';
const IDB_STORE = 'sqlite_blob';
const IDB_KEY = 'main';

function openIndexedDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadFromIndexedDb() {
  try {
    const idb = await openIndexedDb();
    return new Promise((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function saveToIndexedDb(data) {
  const idb = await openIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(data, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadDatabaseBlob() {
  const layout = await getStorageLayout();
  if (layout === 'tauri-portable' || layout === 'tauri-appdata' || layout === 'capacitor') {
    return readStorageFile(DB_FILENAME);
  }
  return loadFromIndexedDb();
}

export async function saveDatabaseBlob(data) {
  const layout = await getStorageLayout();
  if (layout === 'tauri-portable' || layout === 'tauri-appdata' || layout === 'capacitor') {
    await writeStorageFile(DB_FILENAME, data);
    return;
  }
  await saveToIndexedDb(data);
}
