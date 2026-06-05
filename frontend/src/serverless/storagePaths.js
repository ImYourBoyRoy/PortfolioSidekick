// ./frontend/src/serverless/storagePaths.js
/**
 * Resolves where Portfolio Sidekick stores on-device data.
 * Desktop (Tauri) portable mode: `data/` beside the executable ($EXE/data).
 * Android uses Capacitor internal storage; dev uses IndexedDB/localStorage.
 */

import { Capacitor } from '@capacitor/core';

const DATA_SUBDIR = 'data';
const INSTALLED_MARKER = 'portfolio_sidekick.installed';

let cachedLayout = null;
let cachedPortableDir = null;

async function isTauriRuntime() {
  try {
    const { isTauri } = await import('@tauri-apps/api/core');
    return isTauri();
  } catch {
    return false;
  }
}

async function getExecutableBaseDir() {
  const { BaseDirectory } = await import('@tauri-apps/plugin-fs');
  return BaseDirectory.Executable;
}

/**
 * @returns {Promise<'tauri-portable' | 'tauri-appdata' | 'capacitor' | 'browser'>}
 */
export async function getStorageLayout() {
  if (cachedLayout) return cachedLayout;

  if (await isTauriRuntime()) {
    const { exists } = await import('@tauri-apps/plugin-fs');
    const baseDir = await getExecutableBaseDir();
    let useAppData;
    try {
      useAppData = await exists(INSTALLED_MARKER, { baseDir });
    } catch {
      useAppData = false;
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

/** Human-readable portable data directory for UI/debug (desktop only). */
export async function getPortableDataDirectory() {
  if (cachedPortableDir) return cachedPortableDir;
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

/**
 * Relative path under the active storage root (includes `data/` on portable desktop).
 */
export async function resolveDataPath(filename) {
  const layout = await getStorageLayout();
  if (layout === 'tauri-portable') {
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

export async function ensureStorageDirectory() {
  const layout = await getStorageLayout();

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
  }
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
