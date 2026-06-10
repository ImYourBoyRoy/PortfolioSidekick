// ./frontend/src/serverless/robinhoodAuth.js
/**
 * Two-phase Robinhood auth ported from robin_stocks (authentication.py + helper.py).
 * Desktop: Tauri Rust HTTP. Android: native Kotlin login via RobinhoodSession plugin.
 *
 * Phase 1: POST credentials → pathfinder → poll inquiries for challenge type.
 * Phase 2: push poll / SMS-email code / workflow advance / re-login.
 *
 * Created by: Roy Dawson IV
 */

import { Capacitor } from '@capacitor/core';
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
import { isSandboxUsername } from './authUtils';
import { fetchPublicQuote } from './yahooQuotes.js';
import { isAndroidNative, isDesktopShell } from '../sidekickClient';
import {
  getPortableDataDirectory,
  isPortableDesktop,
  readStorageFile,
  writeStorageFile,
} from './storagePaths';
import { localDb } from './database';
import { isQuoteUnsupportedSymbol } from './dataIntegrity';
import {
  accountNumberFromRecord,
  buildRobinhoodCashBreakdown,
  extractPortfolioCash,
  extractReportedNetEquity,
  extractReportedNetEquityFromPortfolio,
  selectPrimaryPortfolio,
  selectPrimaryRobinhoodAccount,
} from './robinhoodAccount.js';
import { extractRobinhoodQuotePrice, parseRobinhoodBatchQuotes } from './quotePrice';

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
      throw new Error(
        `${label} timed out after ${Math.round(ms / 1000)}s.${
          isDesktopShell()
            ? ' Open auth.log beside portfolio-sidekick.exe for the last step.'
            : isAndroidNative()
              ? ' Approve MFA in the Robinhood app or retry on a stable connection.'
              : ''
        }`
      );
    }),
  ]);
}

/** robin_stocks push + workflow polling */
const WORKFLOW_POLL_ATTEMPTS = 5;
const WORKFLOW_POLL_INTERVAL_MS = 5000;
/** Python client polls inquiries after pathfinder to detect push/SMS challenge id */
const PHASE1_INQUIRY_ATTEMPTS = 3;
const PHASE1_INQUIRY_INTERVAL_MS = 2000;
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

async function persistSession(profileId, session, username) {
  const normalized = normalizeSession(session);
  if (!normalized) return false;
  try {
    await saveSessionPortable(profileId, normalized, username);
    if (username) localDb.setRobinhoodUsername(profileId, username);
    await authLog(`session saved profile=${profileId}`);
    return true;
  } catch (err) {
    await authLog(`session save failed: ${err?.message || err}`);
    return false;
  }
}

/** Poll until vault session validates — covers async encrypt write after login. */
export async function waitForRobinhoodSession(profileId, maxAttempts = 20, delayMs = 250) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { authenticated } = await resolveActiveRobinhoodSession(profileId);
    if (authenticated) return true;
    await sleep(delayMs);
  }
  return false;
}

async function saveSessionSafe(vault, profileId, session, username) {
  try {
    await vault.saveSession({ profileId, session, username });
  } catch (err) {
    console.warn('[RobinhoodAuth] Vault session save failed:', err);
    throw err;
  }
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

  let challengeType = 'prompt';
  let challengeId = null;
  let challengeStatus = null;

  for (let attempt = 0; attempt < PHASE1_INQUIRY_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(PHASE1_INQUIRY_INTERVAL_MS);
    const inquiries = await requestGet(inquiriesUrl);
    const challenge = extractSheriffChallenge(inquiries);
    if (challenge) {
      challengeType = challenge.challenge_type || challengeType;
      challengeId = challenge.challenge_id;
      challengeStatus = challenge.challenge_status;
      console.info(
        `[RobinhoodAuth] Challenge detected in Phase 1: type=${challengeType} status=${challengeStatus} id=${challengeId}`
      );
      break;
    }
    console.info(`[RobinhoodAuth] Waiting for Robinhood challenge (attempt ${attempt + 1}/${PHASE1_INQUIRY_ATTEMPTS})…`);
  }

  const pending = {
    device_token: deviceToken,
    login_payload: loginPayload,
    workflow_id: workflowId,
    machine_id: machineId,
    challenge_type: challengeType,
    challenge_id: challengeId,
    challenge_status: challengeStatus,
    inquiries_url: inquiriesUrl,
  };

  console.info('[RobinhoodAuth] Phase 1 complete — MFA polling continues in Phase 2.');

  const promptMessage = challengeType === 'prompt'
    ? (challengeId
      ? 'Push sent — approve the login in your Robinhood app. We detect approval automatically.'
      : 'Check your Robinhood app for a login approval request. We detect approval automatically.')
    : mfaUserMessage(challengeType, challengeStatus);

  return {
    status: 'mfa_required',
    mode: 'live',
    challenge_type: challengeType,
    challenge_issued: challengeType !== 'prompt' && challengeStatus === 'issued',
    message: promptMessage,
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
    if (!pushStatus || !['validated', 'redeemed', 'approved', 'completed'].includes(pushStatus.challenge_status)) {
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

/** True when Android native RobinhoodSession plugin exposes full login bridge. */
async function isAndroidNativeAuth() {
  return isAndroidNative()
    && Capacitor.isPluginAvailable('RobinhoodSession');
}

async function normalizeNativeLoginResult(result, profileId, username, options = {}) {
  const normalized = {
    status: result?.status || 'error',
    mode: result?.mode || 'live',
    message: result?.message || 'Robinhood login failed.',
    challenge_type: result?.challenge_type ?? result?.challengeType,
    challenge_issued: result?.challenge_issued ?? result?.challengeIssued,
    session: result?.session,
  };

  if (normalized.status === 'success') {
    memoryChallenges.delete(profileId);
    if (normalized.session) {
      const vault = await getVaultPlugin();
      await saveSessionSafe(vault, profileId, normalizeSession(normalized.session), username);
      await clearChallengeSafe(vault, profileId);
    } else if (options.continueMfa) {
      await waitForRobinhoodSession(profileId, 8, 150);
    }
  }

  return normalized;
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

      if (normalized.status === 'success') {
        memoryChallenges.delete(profileId);
        if (normalized.session) {
          await persistSession(profileId, normalized.session, username);
        } else if (options.continueMfa) {
          await waitForRobinhoodSession(profileId, 8, 150);
        }
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

  if (await isAndroidNativeAuth()) {
    await authLog(`android native login start profile=${profileId} continueMfa=${options.continueMfa === true}`);
    const { RobinhoodSession } = await import('../plugins/robinhood-session');
    try {
      await authLog('invoking RobinhoodSession.robinhoodLogin');
      const timeoutMs = options.continueMfa === true ? 120000 : 60000;
      const result = await withInvokeTimeout(
        RobinhoodSession.robinhoodLogin({
          profileId: Number(profileId),
          username,
          password,
          mfaCode: mfaCode || null,
          continueMfa: options.continueMfa === true,
        }),
        timeoutMs,
        'Native Robinhood login',
      );
      await authLog(`RobinhoodSession.robinhoodLogin returned status=${result?.status || 'unknown'}`);
      return normalizeNativeLoginResult(result, profileId, username, options);
    } catch (err) {
      await authLog(`RobinhoodSession.robinhoodLogin error: ${err?.message || err}`);
      const msg = err?.message || String(err);
      if (options.continueMfa === true && /Unable to resolve host|UnknownHost|failed to connect|ETIMEDOUT/i.test(msg)) {
        return {
          status: 'mfa_required',
          mode: 'live',
          message: 'Network interrupted — retrying automatically…',
          challenge_type: 'prompt',
          challenge_issued: false,
        };
      }
      return {
        status: 'error',
        mode: 'live',
        message: msg,
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
    await resetAuthHttpSession();
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

/** Load vault session, refresh if needed, and reconcile username with the SQLite profile. */
export async function resolveActiveRobinhoodSession(profileId) {
  const urls = await buildRhUrls();
  let username;
  let session;
  try {
    ({ session, username } = await loadStoredSession(profileId));
  } catch {
    return { session: null, username: null, authenticated: false };
  }

  if (!username) {
    const profile = localDb.getProfiles().find((p) => p.id === profileId);
    username = profile?.robinhood_username || null;
  }

  if (!session) {
    return { session: null, username, authenticated: false };
  }

  let active = session;
  let valid = await validateSession(active, urls);
  if (!valid) {
    await authLog('status session invalid — attempting refresh');
    const refreshed = await refreshSession(active, urls);
    if (refreshed) {
      await persistRefreshedSession(profileId, refreshed, username || '');
      active = refreshed;
      valid = await validateSession(active, urls);
      if (!valid) await authLog('status still invalid after refresh');
    } else {
      await authLog('status refresh failed — not authenticated');
    }
  }

  if (valid && username) {
    const profile = localDb.getProfiles().find((p) => p.id === profileId);
    if (profile && !profile.robinhood_username) {
      localDb.setRobinhoodUsername(profileId, username);
    }
  }

  return {
    session: valid ? active : null,
    username,
    authenticated: valid,
  };
}

export async function robinhoodStatus(profileId) {
  const { username, authenticated } = await resolveActiveRobinhoodSession(profileId);
  return authenticated
    ? { authenticated: true, username }
    : { authenticated: false, username: username || null };
}

export async function robinhoodSyncHoldings(profileId) {
  const urls = await buildRhUrls();
  await authLog(`sync start profile=${profileId}`);

  const { session, authenticated } = await resolveActiveRobinhoodSession(profileId);
  if (!session || !authenticated) {
    await authLog('sync aborted — no valid session in vault');
    throw new Error('Not authenticated. Please sign in first.');
  }

  const auth = authHeader(session);
  await authLog('sync fetching positions');
  const positions = await requestGet(urls.positions, auth);
  if (!positions?.results) {
    await authLog('sync positions request failed or empty');
    throw new Error('Could not load Robinhood positions. Check auth.log and try signing in again.');
  }
  const eligible = positions.results.filter((pos) => parseFloat(pos.quantity || '0') > 0);
  await authLog(`sync positions count=${eligible.length}`);

  const hiddenTickers = new Set(localDb.getHiddenTickers(profileId));

  const holdings = (
    await mapPool(eligible, async (pos) => {
      const qty = parseFloat(pos.quantity || '0');
      try {
        const instrument = await requestGet(pos.instrument, auth);
        const symbol = instrument?.symbol;
        if (!symbol) return null;
        if (hiddenTickers.has(String(symbol).toUpperCase())) return null;
        const avgBuy = parseFloat(pos.average_buy_price || '0');
        let price = null;
        let priceStale = false;
        let quoteStatus = 'live';
        if (isQuoteUnsupportedSymbol(symbol)) {
          const positionEquity = parseFloat(pos.equity || pos.market_value || '0');
          if (positionEquity > 0 && qty > 0) {
            price = positionEquity / qty;
            quoteStatus = 'position_equity';
            priceStale = false;
          } else {
            priceStale = true;
            quoteStatus = 'non_quotable';
          }
        } else {
          let positionEquity = parseFloat(pos.equity || pos.market_value || '0');
          if (!(positionEquity > 0) && pos.url) {
            try {
              const detail = await requestGet(pos.url, auth);
              positionEquity = parseFloat(detail?.equity || detail?.market_value || '0');
            } catch {
              // Fall through to quote price.
            }
          }
          if (positionEquity > 0 && qty > 0) {
            price = positionEquity / qty;
            quoteStatus = 'position_equity';
            priceStale = false;
          } else {
          const rhPrice = extractRobinhoodQuotePrice(await requestGet(urls.quotes(symbol), auth));
          if (rhPrice != null) {
            price = rhPrice;
          } else {
            try {
              price = await fetchPublicQuote(symbol);
            } catch {
              // Yahoo fallback is best-effort during sync.
            }
          }
          priceStale = price == null;
          }
        }
        return {
          ticker: symbol,
          shares: qty,
          avg_buy_price: avgBuy,
          current_price: price,
          price_stale: priceStale,
          quote_status: quoteStatus,
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

/**
 * Per-position equity marks from Robinhood (matches app position values better than quote × shares).
 */
export async function fetchRobinhoodPositionMarks(profileId, hiddenTickers = new Set()) {
  const { session, authenticated } = await resolveActiveRobinhoodSession(profileId);
  if (!session || !authenticated) return { bySymbol: {}, totalEquity: 0 };

  const urls = await buildRhUrls();
  const auth = authHeader(session);
  const positions = await requestGet(urls.positions, auth);
  const eligible = (positions?.results || []).filter((pos) => parseFloat(pos.quantity || '0') > 0);
  const bySymbol = {};
  let totalEquity = 0;

  const rows = await mapPool(eligible, async (pos) => {
    const qty = parseFloat(pos.quantity || '0');
    let equity = parseFloat(pos.equity || pos.market_value || '0');
    if (!(equity > 0) && pos.url) {
      try {
        const detail = await requestGet(pos.url, auth);
        equity = parseFloat(detail?.equity || detail?.market_value || '0');
      } catch {
        // Best-effort position detail.
      }
    }
    let symbol;
    try {
      const instrument = await requestGet(pos.instrument, auth);
      symbol = instrument?.symbol;
    } catch {
      return null;
    }
    if (!symbol || hiddenTickers.has(String(symbol).toUpperCase())) return null;
    if (!(equity > 0)) return null;
    return {
      symbol: String(symbol).toUpperCase(),
      equity,
      impliedPrice: qty > 0 ? equity / qty : null,
      quantity: qty,
    };
  }, 8);

  for (const row of rows) {
    if (!row?.symbol) continue;
    bySymbol[row.symbol] = {
      equity: row.equity,
      implied_price: row.impliedPrice,
      quantity: row.quantity,
    };
    totalEquity += row.equity;
  }

  return { bySymbol, totalEquity: Math.round(totalEquity * 100) / 100 };
}

/** Batch quote fetch — one Robinhood request for many symbols (rate-limit friendly). */
export async function fetchRobinhoodBatchQuotes(profileId, symbols) {
  const unique = [...new Set((symbols || []).map((s) => String(s).toUpperCase().trim()).filter(Boolean))];
  if (unique.length === 0) return {};

  const { session, authenticated } = await resolveActiveRobinhoodSession(profileId);
  if (!session || !authenticated) {
    await authLog('batch quotes skipped — no valid Robinhood session');
    return null;
  }

  const urls = await buildRhUrls();
  const auth = authHeader(session);
  const prices = {};
  const chunkSize = 40;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    try {
      const data = await requestGet(urls.quotesBatch(chunk), auth);
      const resultCount = Array.isArray(data?.results) ? data.results.length : 0;
      if (!data || resultCount === 0) {
        await authLog(`batch quotes empty chunk=${chunk.join(',')} dataKeys=${data ? Object.keys(data).join(',') : 'null'}`);
      }
      let parsed = parseRobinhoodBatchQuotes(data, chunk);

      if (Object.keys(parsed).length === 0 && Array.isArray(data?.results)) {
        for (let j = 0; j < data.results.length && j < chunk.length; j += 1) {
          const item = data.results[j];
          if (!item || typeof item === 'string') continue;
          const price = extractRobinhoodQuotePrice(item);
          if (price != null) parsed[chunk[j]] = price;
        }
      }

      const halUrls = (data?.results || []).filter(
        (r) => typeof r === 'string' && r.includes('/quotes/'),
      );
      if (halUrls.length > 0) {
        const halPrices = await mapPool(halUrls, async (url) => {
          const quote = await requestGet(url, auth);
          const sym = quote?.symbol;
          const price = extractRobinhoodQuotePrice(quote);
          if (!sym || price == null) return null;
          return { symbol: String(sym).toUpperCase(), price };
        }, 6);
        for (const row of halPrices) {
          if (row?.symbol && row.price != null) parsed[row.symbol] = row.price;
        }
      }

      Object.assign(prices, parsed);
    } catch (err) {
      await authLog(`batch quotes failed chunk=${chunk.join(',')}: ${err?.message || err}`);
      return Object.keys(prices).length > 0 ? prices : null;
    }
  }

  await authLog(`batch quotes resolved count=${Object.keys(prices).length}/${unique.length}`);
  return prices;
}

/**
 * Robinhood live marks — batch first, then per-symbol /quotes/{symbol}/ (sync-proven path).
 */
export async function fetchRobinhoodLiveQuotes(profileId, symbols) {
  const unique = [...new Set((symbols || []).map((s) => String(s).toUpperCase().trim()).filter(Boolean))];
  if (unique.length === 0) return {};

  const batch = await fetchRobinhoodBatchQuotes(profileId, unique);
  const prices = { ...(batch || {}) };
  const missing = unique.filter((sym) => prices[sym] == null);
  if (missing.length === 0) return prices;

  const { session, authenticated } = await resolveActiveRobinhoodSession(profileId);
  if (!session || !authenticated) return prices;

  const urls = await buildRhUrls();
  const auth = authHeader(session);
  await authLog(`batch quotes gap-fill individual count=${missing.length}`);

  const filled = await mapPool(missing, async (symbol) => {
    try {
      const quote = await requestGet(urls.quotes(symbol), auth);
      const price = extractRobinhoodQuotePrice(quote);
      if (price == null) return null;
      return { symbol, price };
    } catch (err) {
      await authLog(`individual quote failed ${symbol}: ${err?.message || err}`);
      return null;
    }
  }, 6);

  for (const row of filled) {
    if (row?.symbol && row.price != null) prices[row.symbol] = row.price;
  }

  await authLog(`live quotes total count=${Object.keys(prices).length}/${unique.length}`);
  return prices;
}

/** Robinhood-reported account equity (matches mobile app net equity when linked). */
export async function fetchRobinhoodAccountSummary(profileId) {
  const { session, authenticated } = await resolveActiveRobinhoodSession(profileId);
  if (!session || !authenticated) return null;

  const urls = await buildRhUrls();
  try {
    const data = await requestGet(urls.accounts, authHeader(session));
    const acct = selectPrimaryRobinhoodAccount(data?.results);
    if (!acct) {
      await authLog('account summary empty results');
      return null;
    }
    const cash = extractPortfolioCash(acct);
    let reported = extractReportedNetEquity(acct) || 0;
    let equitySource = 'accounts';
    let portfolioSnapshot = null;
    const auth = authHeader(session);
    const accountNumber = accountNumberFromRecord(acct);

    if (accountNumber) {
      try {
        portfolioSnapshot = await requestGet(urls.portfolioByAccount(accountNumber), auth);
        const fromDirect = extractReportedNetEquityFromPortfolio(portfolioSnapshot);
        if (fromDirect != null && fromDirect > 0) {
          reported = fromDirect;
          equitySource = 'portfolio-direct';
        }
      } catch (err) {
        await authLog(`direct portfolio fetch failed acct=${accountNumber}: ${err?.message || err}`);
      }
    }

    if (!(reported > 0) && acct.portfolio) {
      try {
        portfolioSnapshot = await requestGet(acct.portfolio, auth);
        const fromLinked = extractReportedNetEquityFromPortfolio(portfolioSnapshot);
        if (fromLinked != null && fromLinked > 0) {
          reported = fromLinked;
          equitySource = 'portfolio-linked';
        }
      } catch (err) {
        await authLog(`linked portfolio fetch failed: ${err?.message || err}`);
      }
    }

    if (!(reported > 0)) {
      try {
        const pfList = await requestGet(urls.portfolios, auth);
        portfolioSnapshot = selectPrimaryPortfolio(pfList?.results, acct.portfolio) || portfolioSnapshot;
        const fromList = extractReportedNetEquityFromPortfolio(portfolioSnapshot);
        if (fromList != null && fromList > 0) {
          reported = fromList;
          equitySource = 'portfolios-list';
        }
      } catch (err) {
        await authLog(`portfolios list fetch failed: ${err?.message || err}`);
      }
    }

    let pendingDividendTotal = 0;
    try {
      const dividends = await requestGet(urls.dividends, auth);
      for (const row of (dividends?.results || [])) {
        const state = String(row?.state || '').toLowerCase();
        if (state && state !== 'pending' && state !== 'confirmed') continue;
        const amount = parseFloat(row?.amount || row?.cash_amount || '0');
        if (Number.isFinite(amount) && amount > 0) pendingDividendTotal += amount;
      }
      pendingDividendTotal = Math.round(pendingDividendTotal * 100) / 100;
    } catch (err) {
      await authLog(`dividends fetch skipped: ${err?.message || err}`);
    }

    const cashBreakdown = buildRobinhoodCashBreakdown(acct, portfolioSnapshot);
    if (pendingDividendTotal > 0) cashBreakdown.pending_dividends = pendingDividendTotal;

    await authLog(
      `account equity profile=${profileId} source=${equitySource} accounts=${Array.isArray(data?.results) ? data.results.length : 0} `
      + `acct_portfolio_equity=${acct.portfolio_equity} pf_equity=${portfolioSnapshot?.equity} `
      + `pf_market_value=${portfolioSnapshot?.market_value} picked=${reported} cash=${cash} `
      + `pending_div=${pendingDividendTotal}`,
    );
    return {
      reported_equity: reported,
      cash,
      equity_source: equitySource,
      cash_breakdown: cashBreakdown,
      pending_dividends: pendingDividendTotal,
      portfolio_equity: parseFloat(acct.portfolio_equity) || parseFloat(portfolioSnapshot?.equity) || 0,
      portfolio_market_value: parseFloat(portfolioSnapshot?.market_value) || 0,
      extended_hours_portfolio_equity: parseFloat(acct.extended_hours_portfolio_equity)
        || parseFloat(portfolioSnapshot?.extended_hours_equity) || 0,
      last_core_portfolio_equity: parseFloat(acct.last_core_portfolio_equity)
        || parseFloat(portfolioSnapshot?.last_core_equity) || 0,
      account_count: Array.isArray(data?.results) ? data.results.length : 0,
      account_number: accountNumber,
    };
  } catch (err) {
    await authLog(`account summary failed: ${err?.message || err}`);
    return null;
  }
}
