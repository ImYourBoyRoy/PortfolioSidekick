// ./sidekick/src/serverless/appUpdater.js
/**
 * Download GitHub release artifacts and launch platform installers.
 * Windows/macOS/Linux: save beside portable data/ and open the installer/archive.
 * Android: opens the APK URL in the system browser for sideload install.
 *
 * Created by: Roy Dawson IV
 */

import { Capacitor } from '@capacitor/core';
import { isDesktopShell } from '../lib/sidekickClient.js';
import { nativeHttpGetArrayBuffer } from './nativeHttp.js';
import { openUpdateDownload } from './updateChecker.js';

/** @param {string | null | undefined} platform */
export function canSelfInstallUpdate(platform) {
  return platform === 'windows' || platform === 'macos' || platform === 'linux' || platform === 'android';
}

/** @param {string} name */
export function sanitizeUpdateFilename(name) {
  const base = String(name || 'PortfolioSidekick-update').trim();
  return base.replace(/[^\w.-]/g, '_') || 'PortfolioSidekick-update';
}

/**
 * @param {{ downloadUrl?: string | null, downloadName?: string | null, latestVersion?: string, platform?: string } | null | undefined} updateInfo
 * @param {{ onProgress?: (message: string) => void }} [options]
 */
export async function downloadAndInstallUpdate(updateInfo, options = {}) {
  const url = updateInfo?.downloadUrl;
  if (!url) throw new Error('No platform download URL — open the GitHub release page instead.');

  const filename = sanitizeUpdateFilename(
    updateInfo.downloadName || `PortfolioSidekick-${updateInfo.platform || 'update'}-v${updateInfo.latestVersion || 'latest'}`,
  );
  const onProgress = options.onProgress || (() => {});

  if (isDesktopShell()) {
    const { invoke, isTauri } = await import('@tauri-apps/api/core');
    if (!(await isTauri())) throw new Error('Desktop shell is not ready for self-update.');

    onProgress('Downloading update from GitHub…');
    const buffer = await nativeHttpGetArrayBuffer(url, { timeoutMs: 300_000 });
    if (!buffer || buffer.byteLength < 1024) {
      throw new Error('Download failed or file was unexpectedly small.');
    }

    onProgress('Saving installer beside your portable data folder…');
    const bytes = Array.from(new Uint8Array(buffer));
    await invoke('portable_write_file', { filename, contents: bytes });

    onProgress('Launching installer — follow the prompts, then restart Sidekick.');
    const launchedPath = await invoke('ps_launch_update', { installerFilename: filename });
    return { mode: 'desktop_installer', path: launchedPath, filename };
  }

  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    onProgress('Opening APK download in your browser…');
    const opened = await openUpdateDownload(url);
    if (!opened) throw new Error('Could not open the APK download link.');
    return {
      mode: 'android_browser',
      message: 'When the APK finishes downloading, tap it and allow install from this source if prompted.',
    };
  }

  onProgress('Opening download in your browser…');
  const opened = await openUpdateDownload(url);
  if (!opened) throw new Error('Could not open the download link.');
  return { mode: 'browser' };
}
