// ./frontend/src/serverless/robinhoodAuth.js
/**
 * Two-phase Robinhood auth ported from robin_stocks (authentication.py + helper.py).
 * Runs entirely in embedded JS — Tauri native HTTP on desktop, CapacitorHttp on Android.
 *
 * Phase 1: POST credentials → pathfinder → poll inquiries for challenge type.
 * Phase 2: push poll / SMS-email code / workflow advance / re-login.
 *
 * Created by: Roy Dawson IV
 */

import { APP_VERSION } from '../appVersion';
import {
  authHeader,
  buildLoginPayload,
  buildRefreshPayload,
  buildRhUrls,
  generateDeviceToken,
  getAuthTransport,
  requestGet,
  requestPost,
  resetAuthHttpSession,
  sessionPayload,
} from './robinhoodAuthCore';
import {
  getPortableDataDirectory,
  isPortableDesktop,
  readStorageFile,
  writeStorageFile,
} from './storagePaths';

const VAULT_FILENAME = 'robinhood_vault.json';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function authLog(line) {
  console.info(`[RobinhoodAuth] ${line}`);
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('auth_log_append', { line });
  } catch {
    // Best effort.
  }
}

function withInvokeTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    sleep(ms).then(() => {
      throw new Error(`${label} timed out after ${Math.round(ms / 1000)}s. Open auth.log beside portfolio-sidekick.exe for the last step.`);
    }),
  ]);
}

/** robin_stocks push + workflow polling */
const WORKFLOW_POLL_ATTEMPTS = 5;
const WORKFLOW_POLL_INTERVAL_MS = 5000;
const memoryChallenges = new Map();

/** True when Tauri desktop Rust auth commands are available (not pywebview / browser). */
async function isDesktopRustAuth() {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke('rh_desktop_ready')) === true;
  } catch {
    return false;
  }
}

async function getVaultPlugin() {
  const { RobinhoodSession } = await import('../plugins/robinhood-session');
  return RobinhoodSession;
}

async function loadChallengeState(vault, profileId) {
  if (memoryChallenges.has(profileId)) {
    return memoryChallenges.get(profileId);
  }
  try {
    const loaded = await vault.loadChallenge({ profileId });
    return loaded?.pending || null;
  } catch {
    return null;
  }
}

async function saveChallengeSafe(vault, profileId, pending) {
  memoryChallenges.set(profileId, pending);
  try {
    await vault.saveChallenge({ profileId, pending });
  } catch (err) {
    console.warn('[RobinhoodAuth] Vault challenge save failed; using in-memory MFA state.', err);
  }
}

async function clearChallengeSafe(vault, profileId) {
  memoryChallenges.delete(profileId);
  try {
    await vault.clearChallenge({ profileId });
  } catch {
    // Best effort.
  }
}

async function readPortableVault() {
  if (await isDesktopRustAuth()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const json = await invoke('vault_read');
      return JSON.parse(json);
    } catch (err) {
      await authLog(`vault read failed: ${err?.message || err}`);
      return { sessions: {}, challenges: {}, usernames: {} };
    }
  }
  const raw = await readStorageFile(VAULT_FILENAME);
  if (!raw) return { sessions: {}, challenges: {}, usernames: {} };
  try {
    return JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return { sessions: {}, challenges: {}, usernames: {} };
  }
}

async function writePortableVault(vault) {
  const payload = JSON.stringify(vault);
  if (await isDesktopRustAuth()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('vault_write', { json: payload });
    return;
  }
  await writeStorageFile(VAULT_FILENAME, new TextEncoder().encode(payload));
}

function normalizeSession(raw) {
  if (!raw) return null;
  const access = raw.access_token || raw.accessToken;
  if (!access) return null;
  return {
    token_type: raw.token_type || raw.tokenType || 'Bearer',
    access_token: access,
    refresh_token: raw.refresh_token || raw.refreshToken || '',
    device_token: raw.device_token || raw.deviceToken || '',
  };
}

async function loadSessionPortable(profileId) {
  const vault = await readPortableVault();
  const raw = vault.sessions[String(profileId)];
  if (!raw) return null;
  try {
    return normalizeSession(typeof raw === 'string' ? JSON.parse(raw) : raw);
  } catch {
    return null;
  }
}

async function loadUsernamePortable(profileId) {
  const vault = await readPortableVault();
  return vault.usernames[String(profileId)] || null;
}

async function wipeSessionPortable(profileId) {
  const vault = await readPortableVault();
  delete vault.sessions[String(profileId)];
  delete vault.usernames[String(profileId)];
  delete vault.challenges[String(profileId)];
  await writePortableVault(vault);
}

async function saveSessionPortable(profileId, session, username) {
  const normalized = normalizeSession(session);
  if (!normalized) return;
  const vault = await readPortableVault();
  vault.sessions[String(profileId)] = JSON.stringify(normalized);
  if (username) vault.usernames[String(profileId)] = username;
  delete vault.challenges[String(profileId)];
  await writePortableVault(vault);
}

function persistSessionBackground(profileId, session, username) {
  void (async () => {
    try {
      await saveSessionPortable(profileId, session, username);
      await authLog(`session saved profile=${profileId}`);
    } catch (err) {
      await authLog(`session save failed: ${err?.message || err}`);
    }
  })();
}

async function saveSessionSafe(vault, profileId, session, username) {
  try {
    await vault.saveSession({ profileId, session, username });
  } catch (err) {
    console.warn('[RobinhoodAuth] Vault session save failed:', err);
    throw err;
  }
}

function isSandboxUsername(username) {
  const u = (username || '').toLowerCase();
  return u === 'sandbox' || u === 'example' || u.includes('test');
}

function workflowApproved(inqResp) {
  if (!inqResp) return false;
  const typeCtx = inqResp.type_context || {};
  if (typeCtx.result === 'workflow_status_approved') return true;
  const vw = inqResp.verification_workflow || {};
  return vw.workflow_status === 'workflow_status_approved';
}

function extractSheriffChallenge(inquiries) {
  const challenge = inquiries?.context?.sheriff_challenge;
  if (!challenge) return null;
  return {
    challenge_type: challenge.type || 'sms',
    challenge_id: challenge.id || null,
    challenge_status: challenge.status || null,
  };
}

function mfaUserMessage(challengeType, challengeStatus) {
  if (challengeType === 'prompt') {
    return 'Approve this login request in your Robinhood mobile app. We detect approval automatically.';
  }
  if (challengeType === 'email') {
    return challengeStatus === 'issued'
      ? 'Enter the verification code sent to your email.'
      : 'Waiting for Robinhood to send your email verification code...';
  }
  return challengeStatus === 'issued'
    ? 'Enter the verification code sent via SMS.'
    : 'Waiting for Robinhood to send your SMS verification code...';
}

/** Refresh challenge state from inquiries (dynamic type/id during Phase 2). */
async function refreshPendingFromInquiries(pending) {
  const inquiries = await requestGet(pending.inquiries_url);
  const challenge = extractSheriffChallenge(inquiries);
  if (!challenge) return pending;
  const updated = {
    ...pending,
    challenge_type: challenge.challenge_type || pending.challenge_type,
    challenge_id: challenge.challenge_id || pending.challenge_id,
    challenge_status: challenge.challenge_status || pending.challenge_status,
  };
  if (
    updated.challenge_type !== pending.challenge_type
    || updated.challenge_id !== pending.challenge_id
    || updated.challenge_status !== pending.challenge_status
  ) {
    console.info(
      `[RobinhoodAuth] Challenge updated: type=${updated.challenge_type} status=${updated.challenge_status} id=${updated.challenge_id}`
    );
  }
  return updated;
}

async function initiateChallenge(loginResponse, deviceToken, loginPayload, urls) {
  const workflowId = loginResponse.verification_workflow.id;

  const machineData = await requestPost(
    urls.pathfinder,
    { device_id: deviceToken, flow: 'suv', input: { workflow_id: workflowId } },
    { json: true }
  );

  if (!machineData?.id) {
    return {
      status: 'error',
      mode: 'live',
      message: 'Failed to initiate Robinhood verification flow. Check your internet connection and try again.',
    };
  }

  const machineId = machineData.id;
  const inquiriesUrl = urls.inquiries(machineId);

  // Return immediately — Phase 2 polls inquiries (robin_stocks sleeps 5s in a loop).
  const pending = {
    device_token: deviceToken,
    login_payload: loginPayload,
    workflow_id: workflowId,
    machine_id: machineId,
    challenge_type: 'prompt',
    challenge_id: null,
    challenge_status: null,
    inquiries_url: inquiriesUrl,
  };

  console.info('[RobinhoodAuth] Phase 1 complete — pathfinder started, MFA polling in Phase 2.');

  return {
    status: 'mfa_required',
    mode: 'live',
    challenge_type: 'prompt',
    challenge_issued: false,
    message: 'Check your Robinhood app for a login approval request. We detect approval automatically.',
    pending,
  };
}

async function pollWorkflowApproval(inquiriesUrl) {
  for (let attempt = 0; attempt < WORKFLOW_POLL_ATTEMPTS; attempt++) {
    const inqResp = await requestPost(
      inquiriesUrl,
      { sequence: 0, user_input: { status: 'continue' } },
      { json: true }
    );
    if (workflowApproved(inqResp)) return true;
    if (attempt < WORKFLOW_POLL_ATTEMPTS - 1) await sleep(WORKFLOW_POLL_INTERVAL_MS);
  }
  console.warn('[RobinhoodAuth] Workflow not explicitly approved; proceeding like Python client.');
  return false;
}

async function finalizeLogin(loginPayload, deviceToken, urls) {
  const data = await requestPost(urls.login, loginPayload);
  if (data?.access_token) {
    return {
      status: 'success',
      mode: 'live',
      message: 'Successfully connected to Robinhood account!',
      session: data,
      device_token: deviceToken,
    };
  }
  if (data?.verification_workflow) {
    return {
      status: 'error',
      mode: 'live',
      message: 'Verification not fully completed. Please restart login and try again.',
    };
  }
  return {
    status: 'error',
    mode: 'live',
    message: `Login failed after verification: ${data?.detail || 'No response from Robinhood'}`,
  };
}

/**
 * Phase 2 — mirrors backend _complete_challenge + robin_stocks push polling.
 */
async function completeChallenge(pending, mfaCode, urls) {
  // One inquiries GET per poll tick (App.jsx polls every 5s — same cadence as robin_stocks).
  let active = await refreshPendingFromInquiries(pending);
  const challengeType = active.challenge_type;

  if (challengeType === 'prompt') {
    if (!active.challenge_id) {
      return {
        status: 'mfa_required',
        mode: 'live',
        challenge_type: 'prompt',
        challenge_issued: false,
        message: 'Still waiting for Robinhood to issue the app push. Keep the Robinhood app open and connected.',
        pending: active,
      };
    }

    const pushStatus = await requestGet(urls.pushStatus(active.challenge_id));
    if (!pushStatus || pushStatus.challenge_status !== 'validated') {
      return {
        status: 'mfa_required',
        mode: 'live',
        challenge_type: 'prompt',
        challenge_issued: false,
        message: 'Push sent — approve the login in your Robinhood app. Waiting for approval…',
        pending: active,
      };
    }
    console.info('[RobinhoodAuth] Push challenge approved.');
  } else {
    if (!active.challenge_id || active.challenge_status !== 'issued') {
      active = await refreshPendingFromInquiries(active);
    }

    if (!active.challenge_id) {
      return {
        status: 'mfa_required',
        mode: 'live',
        challenge_type: challengeType,
        challenge_issued: false,
        message: 'Robinhood is still preparing your verification challenge. Waiting...',
        pending: active,
      };
    }

    if (active.challenge_status !== 'issued') {
      return {
        status: 'mfa_required',
        mode: 'live',
        challenge_type: challengeType,
        challenge_issued: false,
        message: mfaUserMessage(challengeType, active.challenge_status),
        pending: active,
      };
    }

    if (!mfaCode) {
      return {
        status: 'mfa_required',
        mode: 'live',
        challenge_type: challengeType,
        challenge_issued: true,
        message: mfaUserMessage(challengeType, 'issued'),
        pending: active,
      };
    }

    const challengeResp = await requestPost(
      urls.challengeRespond(active.challenge_id),
      { response: mfaCode }
    );
    if (!challengeResp) {
      return {
        status: 'error',
        mode: 'live',
        message: 'No response from Robinhood challenge endpoint. Please restart login.',
      };
    }
    if (challengeResp.status !== 'validated') {
      return {
        status: 'mfa_required',
        mode: 'live',
        challenge_type: challengeType,
        challenge_issued: true,
        message: `Invalid verification code (status: ${challengeResp.status || 'unknown'}). Please re-enter.`,
        pending: active,
      };
    }
    console.info('[RobinhoodAuth] Verification code accepted.');
  }

  await pollWorkflowApproval(active.inquiries_url);
  return finalizeLogin(active.login_payload, active.device_token, urls);
}

async function validateSession(session, urls) {
  const data = await requestGet(urls.positions, authHeader(session));
  return Boolean(data?.results);
}

async function refreshSession(session, urls) {
  const refreshToken = session?.refresh_token;
  const deviceToken = session?.device_token || '';
  if (!refreshToken) {
    await authLog('token refresh skipped — no refresh_token');
    return null;
  }
  try {
    await authLog('token refresh POST oauth2/token');
    const data = await requestPost(urls.login, buildRefreshPayload(refreshToken, deviceToken));
    if (!data?.access_token) {
      await authLog(`token refresh failed — no access_token (detail=${data?.detail || 'none'})`);
      return null;
    }
    await authLog('token refresh succeeded');
    return sessionPayload(data, deviceToken);
  } catch (err) {
    await authLog(`token refresh error: ${err?.message || err}`);
    return null;
  }
}

async function mapPool(items, mapper, concurrency = 8) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map(mapper));
    results.push(...chunkResults);
  }
  return results;
}

export async function robinhoodLogin(profileId, username, password, mfaCode = null, options = {}) {
  if (isSandboxUsername(username)) {
    return {
      status: 'success',
      mode: 'sandbox',
      message: 'Connected to Sandbox Profile! Using Yahoo Finance quotes.',
    };
  }

  if (await isPortableDesktop()) {
    await authLog(`login start profile=${profileId} continueMfa=${options.continueMfa === true}`);

    if (!(await isDesktopRustAuth())) {
      const dataDir = await getPortableDataDirectory();
      return {
        status: 'error',
        mode: 'live',
        message:
          `Native Robinhood auth is unavailable on this executable (need v${APP_VERSION}+). ` +
          'Rebuild with .\\compile_windows.ps1, then run frontend\\src-tauri\\target\\release\\portfolio-sidekick.exe — ' +
          `not PortfolioSidekick.exe or an old GitHub download. Expected auth.log in ${dataDir || '<exe>\\data'}.`,
      };
    }

    const { invoke } = await import('@tauri-apps/api/core');
    try {
      await authLog('invoking rh_robinhood_login');
      const result = await withInvokeTimeout(
        invoke('rh_robinhood_login', {
          payload: {
            profileId: Number(profileId),
            username,
            password,
            mfaCode: mfaCode || null,
            continueMfa: options.continueMfa === true,
          },
        }),
        45000,
        'Native Robinhood login'
      );
      await authLog(`rh_robinhood_login returned status=${result?.status || 'unknown'}`);

      const normalized = {
        status: result?.status || 'error',
        mode: result?.mode || 'live',
        message: result?.message || 'Robinhood login failed.',
        challenge_type: result?.challenge_type ?? result?.challengeType,
        challenge_issued: result?.challenge_issued ?? result?.challengeIssued,
        session: result?.session,
      };

      if (normalized.status === 'success' && normalized.session) {
        memoryChallenges.delete(profileId);
        const session = normalizeSession(normalized.session);
        if (session) persistSessionBackground(profileId, session, username);
      }

      return normalized;
    } catch (err) {
      await authLog(`rh_robinhood_login error: ${err?.message || err}`);
      return {
        status: 'error',
        mode: 'live',
        message: err?.message || String(err),
      };
    }
  }

  const vault = await getVaultPlugin();

  const urls = await buildRhUrls();
  const continueMfa = options.continueMfa === true || Boolean(mfaCode);
  let pending = continueMfa ? await loadChallengeState(vault, profileId) : null;
  let result;

  if (continueMfa && pending) {
    console.info(`[RobinhoodAuth] Phase 2: completing ${pending.challenge_type || 'unknown'} challenge for profile ${profileId}`);
    result = await completeChallenge(pending, mfaCode, urls);
    if (result.pending) await saveChallengeSafe(vault, profileId, result.pending);
  } else if (continueMfa) {
    return {
      status: 'error',
      mode: 'live',
      message: 'MFA session expired. Close this dialog and start login again.',
    };
  } else {
    await clearChallengeSafe(vault, profileId);
    resetAuthHttpSession();
    const deviceToken = generateDeviceToken();
    const loginPayload = buildLoginPayload(username, password, deviceToken);
    const transport = await getAuthTransport();
    console.info(`[RobinhoodAuth] Phase 1: POST login for profile ${profileId} (transport=${transport})`);
    const data = await requestPost(urls.login, loginPayload);

    if (!data) {
      return {
        status: 'error',
        mode: 'live',
        message: 'No response from Robinhood servers. Check your internet connection.',
      };
    }

    if (data.access_token) {
      result = {
        status: 'success',
        mode: 'live',
        message: 'Connected to Robinhood account!',
        session: data,
        device_token: deviceToken,
      };
    } else if (data.verification_workflow) {
      result = await initiateChallenge(data, deviceToken, loginPayload, urls);
    } else {
      result = {
        status: 'error',
        mode: 'live',
        message: `Login failed: ${data.detail || 'Unknown error. Check credentials.'}`,
      };
    }
  }

  if (result.status === 'mfa_required' && result.pending) {
    await saveChallengeSafe(vault, profileId, result.pending);
    return {
      status: result.status,
      mode: result.mode,
      challenge_type: result.challenge_type,
      challenge_issued: result.challenge_issued ?? false,
      message: result.message,
    };
  }

  if (result.status === 'success' && result.mode !== 'sandbox' && result.session) {
    await saveSessionSafe(vault, profileId, sessionPayload(result.session, result.device_token), username);
    await clearChallengeSafe(vault, profileId);
  } else if (result.status === 'error') {
    await clearChallengeSafe(vault, profileId);
  }

  return {
    status: result.status,
    mode: result.mode,
    message: result.message,
    challenge_type: result.challenge_type,
    challenge_issued: result.challenge_issued,
  };
}

export async function robinhoodLogout(profileId) {
  memoryChallenges.delete(profileId);
  if (await isPortableDesktop()) {
    await authLog(`logout profile=${profileId}`);
    await wipeSessionPortable(profileId);
  } else {
    const vault = await getVaultPlugin();
    await clearChallengeSafe(vault, profileId);
    await vault.wipe({ profileId }).catch(() => {});
  }
  return {
    status: 'success',
    message: 'Successfully logged out and wiped session from this device.',
  };
}

async function loadStoredSession(profileId) {
  if (await isPortableDesktop()) {
    const session = await loadSessionPortable(profileId);
    const username = await loadUsernamePortable(profileId);
    return { session, username };
  }
  const vault = await getVaultPlugin();
  const username = (await vault.getUsername({ profileId }))?.username || null;
  const session = normalizeSession((await vault.loadSession({ profileId }))?.session);
  return { session, username };
}

async function persistRefreshedSession(profileId, session, username) {
  if (await isPortableDesktop()) {
    await saveSessionPortable(profileId, session, username || '');
    return;
  }
  const vault = await getVaultPlugin();
  await saveSessionSafe(vault, profileId, session, username || '');
}

export async function robinhoodStatus(profileId) {
  const urls = await buildRhUrls();
  let username;
  let session;
  try {
    ({ session, username } = await loadStoredSession(profileId));
  } catch {
    return { authenticated: false };
  }

  if (!username || !session) return { authenticated: false };

  let valid = await validateSession(session, urls);
  if (!valid) {
    await authLog('status session invalid — attempting refresh');
    const refreshed = await refreshSession(session, urls);
    if (refreshed) {
      await persistRefreshedSession(profileId, refreshed, username);
      valid = await validateSession(refreshed, urls);
      if (!valid) await authLog('status still invalid after refresh');
    } else {
      await authLog('status refresh failed — not authenticated');
    }
  }

  return valid ? { authenticated: true, username } : { authenticated: false };
}

export async function robinhoodSyncHoldings(profileId) {
  const urls = await buildRhUrls();
  await authLog(`sync start profile=${profileId}`);

  let session;
  let username;
  try {
    ({ session, username } = await loadStoredSession(profileId));
  } catch (err) {
    await authLog(`sync session load failed: ${err?.message || err}`);
    throw new Error('Not authenticated. Please sign in first.', { cause: err });
  }

  if (!session) {
    await authLog('sync aborted — no session in vault');
    throw new Error('Not authenticated. Please sign in first.');
  }

  let active = session;
  if (!(await validateSession(active, urls))) {
    await authLog('sync session validate failed — trying refresh');
    const refreshed = await refreshSession(active, urls);
    if (refreshed) {
      await persistRefreshedSession(profileId, refreshed, username || '');
      active = refreshed;
    } else {
      await authLog('sync refresh failed');
    }
  }

  if (!(await validateSession(active, urls))) {
    await authLog('sync aborted — session expired');
    throw new Error('Robinhood session expired. Please sign in again.');
  }

  const auth = authHeader(active);
  await authLog('sync fetching positions');
  const positions = await requestGet(urls.positions, auth);
  if (!positions?.results) {
    await authLog('sync positions request failed or empty');
    throw new Error('Could not load Robinhood positions. Check auth.log and try signing in again.');
  }
  const eligible = positions.results.filter((pos) => parseFloat(pos.quantity || '0') > 0);
  await authLog(`sync positions count=${eligible.length}`);

  const holdings = (
    await mapPool(eligible, async (pos) => {
      const qty = parseFloat(pos.quantity || '0');
      try {
        const instrument = await requestGet(pos.instrument, auth);
        const symbol = instrument?.symbol;
        if (!symbol) return null;
        const avgBuy = parseFloat(pos.average_buy_price || '0');
        let price = avgBuy;
        const quote = await requestGet(urls.quotes(symbol), auth);
        if (quote?.last_trade_price) price = parseFloat(quote.last_trade_price);
        return {
          ticker: symbol,
          shares: qty,
          avg_buy_price: avgBuy,
          current_price: price,
        };
      } catch (err) {
        await authLog(`sync position failed ${pos.instrument}: ${err?.message || err}`);
        return null;
      }
    }, 8)
  ).filter(Boolean);

  await authLog(`sync complete holdings=${holdings.length}`);
  return { status: 'success', synced_count: holdings.length, holdings };
}
