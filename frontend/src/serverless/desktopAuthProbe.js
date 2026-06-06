// ./frontend/src/serverless/desktopAuthProbe.js
/**
 * Probes Tauri desktop native Robinhood auth and portable data paths at startup.
 * Used to surface wrong-executable mistakes before login hangs.
 *
 * Created by: Roy Dawson IV
 */

import { APP_VERSION } from '../appVersion';

/**
 * @returns {Promise<{
 *   version: string,
 *   isTauri: boolean,
 *   rustAuth: boolean,
 *   dataPath: string | null,
 *   authLogExists: boolean,
 * }>}
 */
export async function probeDesktopAuth() {
  const result = {
    version: APP_VERSION,
    isTauri: false,
    rustAuth: false,
    dataPath: null,
    authLogExists: false,
  };

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    result.isTauri = true;

    try {
      result.dataPath = await invoke('portable_data_path');
    } catch {
      // Portable path command unavailable.
    }

    try {
      result.rustAuth = (await invoke('rh_desktop_ready')) === true;
    } catch {
      // Native auth commands blocked or missing from this build.
    }

    if (result.dataPath) {
      try {
        result.authLogExists = (await invoke('portable_file_exists', { filename: 'auth.log' })) === true;
      } catch {
        // Best effort.
      }
    }

    try {
      await invoke('auth_log_append', {
        line: `js probe v${APP_VERSION} rust=${result.rustAuth} authLog=${result.authLogExists}`,
      });
    } catch {
      // Best effort.
    }
  } catch {
    // Not a Tauri shell (browser dev, pywebview legacy, etc.).
  }

  return result;
}

export function desktopAuthReadyMessage(probe) {
  if (!probe?.isTauri) {
    return 'Robinhood login requires the Tauri desktop app (portfolio-sidekick.exe), not the browser dev server.';
  }
  if (probe.rustAuth && probe.authLogExists) {
    return `Native auth ready · v${probe.version} · encrypted vault · ${probe.dataPath}`;
  }
  if (probe.rustAuth && !probe.authLogExists) {
    return `Native auth loaded but auth.log missing — restart after rebuilding v${probe.version}. Data: ${probe.dataPath}`;
  }
  return `Wrong build — rebuild with compile_windows.ps1, run target/release/portfolio-sidekick.exe v${probe.version}. Data: ${probe.dataPath || '<exe>/data'}`;
}
