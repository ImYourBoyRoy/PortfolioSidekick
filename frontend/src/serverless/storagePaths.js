// ./frontend/src/serverless/storagePaths.js
/**
 * Resolves where Portfolio Sidekick stores on-device data.
 * Desktop (Tauri) defaults to portable mode: a `data/` folder beside the executable.
 * Android uses Capacitor internal storage; dev uses IndexedDB/localStorage.
 */

import { Capacitor } from '@capacitor/core';

const DATA_SUBDIR = 'data';
const INSTALLED_MARKER = 'portfolio_sidekick.installed';

let cachedLayout = null;

async function isTauriRuntime() {
  try {
    const { isTauri } = await import('@tauri-apps/api/core');
    return isTauri();
  } catch {
    return false;
  }
}

/**
 * @returns {Promise<'tauri-portable' | 'tauri-appdata' | 'capacitor' | 'browser'>}
 */
export async function getStorageLayout() {
  if (cachedLayout) return cachedLayout;

  if (await isTauriRuntime()) {
    const { exists, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    let useAppData;
    try {
      useAppData = await exists(INSTALLED_MARKER, { baseDir: BaseDirectory.App });
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

export async function ensureStorageDirectory() {
  const layout = await getStorageLayout();

  if (layout === 'tauri-portable' || layout === 'tauri-appdata') {
    const { mkdir, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    const baseDir = layout === 'tauri-portable' ? BaseDirectory.App : BaseDirectory.AppData;
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
    const { readFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    const baseDir = layout === 'tauri-portable' ? BaseDirectory.App : BaseDirectory.AppData;
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
    const { writeFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    const baseDir = layout === 'tauri-portable' ? BaseDirectory.App : BaseDirectory.AppData;
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
    const { remove, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    const baseDir = layout === 'tauri-portable' ? BaseDirectory.App : BaseDirectory.AppData;
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
