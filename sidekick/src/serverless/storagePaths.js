// ./sidekick/src/serverless/storagePaths.js
/**
 * Portable storage beside the Tauri executable ($EXE/data).
 * Desktop writes use Rust IPC (reliable on Windows); plugin-fs is fallback.
 * Android uses Capacitor; dev browser uses IndexedDB.
 */

import { Capacitor } from '@capacitor/core';

const DATA_SUBDIR = 'data';
const INSTALLED_MARKER = 'portfolio_sidekick.installed';

let cachedLayout = null;
let cachedPortableDir = null;
let rustStorageChecked = false;
let rustStorageAvailable = false;

export function isTauriShellSync() {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}

async function isTauriRuntime() {
  if (isTauriShellSync()) return true;
  try {
    const { isTauri } = await import('@tauri-apps/api/core');
    return isTauri();
  } catch {
    return false;
  }
}

/** Definitive desktop signal: Rust portable_data_path succeeds. */
async function probeRustPortableStorage() {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const path = await invoke('portable_data_path');
    if (path) {
      cachedPortableDir = path;
      rustStorageAvailable = true;
      rustStorageChecked = true;
      return path;
    }
  } catch {
    // Not Tauri or command unavailable.
  }
  rustStorageChecked = true;
  rustStorageAvailable = false;
  return null;
}

async function canUseRustStorage() {
  if (rustStorageChecked) return rustStorageAvailable;
  await probeRustPortableStorage();
  return rustStorageAvailable;
}

/**
 * Wait until Tauri portable storage is reachable (or give up after retries).
 * Prevents caching browser/IndexedDB layout before the WebView bridge is ready.
 */
export async function waitForPortableStorageReady(maxAttempts = 30) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const path = await probeRustPortableStorage();
    if (path) {
      cachedLayout = 'tauri-portable';
      return path;
    }
    if (await isTauriRuntime()) {
      cachedLayout = 'tauri-portable';
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

/**
 * @returns {Promise<'tauri-portable' | 'tauri-appdata' | 'capacitor' | 'browser'>}
 */
export async function getStorageLayout() {
  if (cachedLayout) return cachedLayout;

  const rustPath = await probeRustPortableStorage();
  if (rustPath) {
    cachedLayout = 'tauri-portable';
    return cachedLayout;
  }

  if (await isTauriRuntime()) {
    const { exists, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    let useAppData = false;
    try {
      useAppData = await exists(INSTALLED_MARKER, { baseDir: BaseDirectory.Executable });
    } catch {
      // Default to portable layout beside the executable.
    }
    cachedLayout = useAppData ? 'tauri-appdata' : 'tauri-portable';
    return cachedLayout;
  }

  if (Capacitor.isNativePlatform()) {
    cachedLayout = 'capacitor';
    return cachedLayout;
  }

  cachedLayout = 'browser';
  return cachedLayout;
}

export async function isPortableDesktop() {
  return (await getStorageLayout()) === 'tauri-portable';
}

export async function getPortableDataDirectory() {
  if (cachedPortableDir) return cachedPortableDir;
  const rustPath = await probeRustPortableStorage();
  if (rustPath) return rustPath;
  if (!(await isTauriRuntime())) return null;
  try {
    const { executableDir, join } = await import('@tauri-apps/api/path');
    const exeDir = await executableDir();
    cachedPortableDir = await join(exeDir, DATA_SUBDIR);
    return cachedPortableDir;
  } catch {
    return null;
  }
}

export async function resolveDataPath(filename) {
  const layout = await getStorageLayout();
  if (layout === 'tauri-portable' && !(await canUseRustStorage())) {
    return `${DATA_SUBDIR}/${filename}`;
  }
  return filename;
}

async function resolveBaseDir() {
  const layout = await getStorageLayout();
  const { BaseDirectory } = await import('@tauri-apps/plugin-fs');
  if (layout === 'tauri-portable') {
    return BaseDirectory.Executable;
  }
  if (layout === 'tauri-appdata') {
    return BaseDirectory.AppData;
  }
  return null;
}

async function rustWrite(filename, data) {
  const { invoke } = await import('@tauri-apps/api/core');
  const bytes = data instanceof Uint8Array ? Array.from(data) : Array.from(new Uint8Array(data));
  await invoke('portable_write_file', { filename, contents: bytes });
}

async function rustRead(filename) {
  const { invoke } = await import('@tauri-apps/api/core');
  const bytes = await invoke('portable_read_file', { filename });
  return new Uint8Array(bytes);
}

export async function ensureStorageDirectory() {
  const layout = await getStorageLayout();

  if (layout === 'tauri-portable' && (await canUseRustStorage())) {
    await getPortableDataDirectory();
    return { kind: layout, rust: true };
  }

  if (layout === 'tauri-portable' || layout === 'tauri-appdata') {
    const { mkdir } = await import('@tauri-apps/plugin-fs');
    const baseDir = await resolveBaseDir();
    if (layout === 'tauri-portable') {
      try {
        await mkdir(DATA_SUBDIR, { baseDir, recursive: true });
      } catch {
        // Directory may already exist.
      }
    } else {
      try {
        await mkdir('', { baseDir, recursive: true });
      } catch {
        // Directory may already exist.
      }
    }
    return { kind: layout, baseDir };
  }

  if (layout === 'capacitor') {
    return { kind: layout };
  }

  return { kind: layout };
}

export async function readStorageFile(filename) {
  const layout = await getStorageLayout();

  if (layout === 'tauri-portable' && (await canUseRustStorage())) {
    try {
      return await rustRead(filename);
    } catch {
      return null;
    }
  }

  if (layout === 'tauri-portable' || layout === 'tauri-appdata') {
    const { readFile } = await import('@tauri-apps/plugin-fs');
    const baseDir = await resolveBaseDir();
    const path = await resolveDataPath(filename);
    try {
      return await readFile(path, { baseDir });
    } catch {
      return null;
    }
  }

  if (layout === 'capacitor') {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    try {
      const result = await Filesystem.readFile({
        path: filename,
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

  return null;
}

export async function writeStorageFile(filename, data) {
  const layout = await getStorageLayout();

  if (layout === 'tauri-portable' && (await canUseRustStorage())) {
    await rustWrite(filename, data);
    return;
  }

  if (layout === 'tauri-portable' || layout === 'tauri-appdata') {
    await ensureStorageDirectory();
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const baseDir = await resolveBaseDir();
    const path = await resolveDataPath(filename);
    await writeFile(path, data, { baseDir });
    return;
  }

  if (layout === 'capacitor') {
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
      path: filename,
      data: base64,
      directory: Directory.Data,
      recursive: true,
    });
    return;
  }

  console.warn(`[Storage] writeStorageFile skipped for "${filename}" (layout=${layout})`);
}

export async function deleteStorageFile(filename) {
  const layout = await getStorageLayout();

  if (layout === 'tauri-portable' || layout === 'tauri-appdata') {
    const { remove } = await import('@tauri-apps/plugin-fs');
    const baseDir = await resolveBaseDir();
    const path = await resolveDataPath(filename);
    try {
      await remove(path, { baseDir });
    } catch {
      // Missing file is fine.
    }
    return;
  }

  if (layout === 'capacitor') {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    try {
      await Filesystem.deleteFile({
        path: filename,
        directory: Directory.Data,
      });
    } catch {
      // Missing file is fine.
    }
  }
}
