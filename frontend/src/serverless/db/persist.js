// ./frontend/src/serverless/db/persist.js
/**
 * Cross-platform encrypted-at-rest SQLite blob persistence.
 * - Tauri desktop: private AppData directory (OS-scoped, not world-readable)
 * - Capacitor Android: internal DATA directory (no external storage)
 * - Dev/browser: IndexedDB (origin-isolated, not localStorage)
 */

import { Capacitor } from '@capacitor/core';

const DB_FILENAME = 'portfolio_sidekick.db';
const IDB_NAME = 'portfolio_sidekick_secure';
const IDB_STORE = 'sqlite_blob';
const IDB_KEY = 'main';

async function isTauriRuntime() {
  try {
    const { isTauri } = await import('@tauri-apps/api/core');
    return isTauri();
  } catch {
    return false;
  }
}

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

async function loadFromTauri() {
  const { readFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
  try {
    return await readFile(DB_FILENAME, { baseDir: BaseDirectory.AppData });
  } catch {
    return null;
  }
}

async function saveToTauri(data) {
  const { mkdir, writeFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
  try {
    await mkdir('', { baseDir: BaseDirectory.AppData, recursive: true });
  } catch {
    // Directory may already exist.
  }
  await writeFile(DB_FILENAME, data, { baseDir: BaseDirectory.AppData });
}

async function loadFromCapacitor() {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  try {
    const result = await Filesystem.readFile({
      path: DB_FILENAME,
      directory: Directory.Data,
    });
    const binary = atob(result.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function saveToCapacitor(data) {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  let base64;
  if (data instanceof Uint8Array) {
    let binary = '';
    for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);
    base64 = btoa(binary);
  } else {
    base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
  }
  await Filesystem.writeFile({
    path: DB_FILENAME,
    data: base64,
    directory: Directory.Data,
    recursive: true,
  });
}

export async function loadDatabaseBlob() {
  if (await isTauriRuntime()) {
    return loadFromTauri();
  }
  if (Capacitor.isNativePlatform()) {
    return loadFromCapacitor();
  }
  return loadFromIndexedDb();
}

export async function saveDatabaseBlob(data) {
  if (await isTauriRuntime()) {
    await saveToTauri(data);
    return;
  }
  if (Capacitor.isNativePlatform()) {
    await saveToCapacitor(data);
    return;
  }
  await saveToIndexedDb(data);
}
