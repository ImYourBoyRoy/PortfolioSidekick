// ./frontend/src/serverless/updateChecker.js
/**
 * Poll GitHub Releases for the latest Portfolio Sidekick build per platform.
 * Compares semver tags to APP_VERSION and returns a platform-matched download URL.
 *
 * Created by: Roy Dawson IV
 */

import { Capacitor } from '@capacitor/core';
import { nativeHttpGet } from './nativeHttp.js';
import { isAndroidNative, isDesktopShell } from '../sidekickClient.js';

const GITHUB_REPO = 'ImYourBoyRoy/PortfolioSidekick';
const RELEASES_LATEST_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const CACHE_KEY = 'ps_update_check_v1';
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

const ASSET_PATTERNS = {
  windows: [/PortfolioSidekick-Windows\.exe$/i],
  macos: [/PortfolioSidekick-MacOS\.zip$/i, /PortfolioSidekick-MacOS\.dmg$/i],
  linux: [/PortfolioSidekick-Linux\.tar\.gz$/i],
  android: [/PortfolioSidekick-Android\.apk$/i],
};

/** @param {string} version */
export function parseSemver(version) {
  const m = String(version).replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** @param {string} latest @param {string} current */
export function isNewerVersion(latest, current) {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

export function detectUpdatePlatform() {
  if (isDesktopShell()) {
    const ua = navigator.userAgent.toLowerCase();
    const platform = (navigator.platform || '').toLowerCase();
    if (platform.includes('win') || ua.includes('windows')) return 'windows';
    if (platform.includes('mac') || ua.includes('macintosh')) return 'macos';
    return 'linux';
  }
  if (isAndroidNative() || (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android')) {
    return 'android';
  }
  return 'unknown';
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.checkedAt || Date.now() - parsed.checkedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(payload) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Quota exceeded — skip cache.
  }
}

/**
 * @param {Array<{ name?: string, browser_download_url?: string }>} assets
 * @param {string} platform
 */
export function pickReleaseAsset(assets, platform) {
  const patterns = ASSET_PATTERNS[platform] || [];
  for (const pattern of patterns) {
    const hit = (assets || []).find((asset) => pattern.test(asset?.name || ''));
    if (hit?.browser_download_url) return hit;
  }
  return null;
}

/**
 * @param {string} currentVersion
 * @param {{ force?: boolean }} [options]
 */
export async function checkForAppUpdate(currentVersion, options = {}) {
  const platform = detectUpdatePlatform();
  const cached = !options.force ? readCache() : null;
  if (cached && cached.currentVersion === currentVersion && cached.platform === platform) {
    return { ...cached, fromCache: true };
  }

  const release = await nativeHttpGet(RELEASES_LATEST_URL, {
    timeoutMs: 30000,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  const latestVersion = String(release?.tag_name || '').replace(/^v/i, '');
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const matched = pickReleaseAsset(assets, platform);
  const updateAvailable = isNewerVersion(latestVersion, currentVersion);

  const payload = {
    currentVersion,
    latestVersion,
    platform,
    updateAvailable,
    releaseName: release?.name || `v${latestVersion}`,
    releaseUrl: release?.html_url || `https://github.com/${GITHUB_REPO}/releases/latest`,
    publishedAt: release?.published_at || null,
    downloadUrl: matched?.browser_download_url || null,
    downloadName: matched?.name || null,
    checkedAt: Date.now(),
    fromCache: false,
    error: null,
  };

  if (!matched && platform !== 'unknown') {
    payload.error = `Latest release found (v${latestVersion}) but no ${platform} asset was attached. Open the GitHub release page to download manually.`;
  }

  writeCache(payload);
  return payload;
}

/** @param {{ downloadUrl?: string | null, releaseUrl?: string | null } | null | undefined} info */
export function getPreferredUpdateUrl(info) {
  return info?.downloadUrl || info?.releaseUrl || null;
}

/** @param {string} url */
export async function copyUpdateDownloadUrl(url) {
  if (!url || typeof window === 'undefined') return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {
    // Fall through to legacy copy.
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}

/** @param {string} url */
export async function openUpdateDownload(url) {
  if (!url || typeof window === 'undefined') return false;

  if (Capacitor.isNativePlatform()) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
      return true;
    } catch {
      // Fall through to web-style openers.
    }
  }

  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  } catch {
    // Fall through.
  }

  try {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (opened) return true;
  } catch {
    // Fall through.
  }

  try {
    window.location.href = url;
    return true;
  } catch {
    return false;
  }
}
