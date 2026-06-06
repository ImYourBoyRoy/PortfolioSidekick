// ./frontend/src/serverless/robinhoodAuth.js
/**
 * Two-phase Robinhood auth matching backend/robinhood_client.py (fast Phase 1)
 * and robin_stocks authentication.py challenge completion semantics (Phase 2).
 *
 * Phase 1: detect challenge type quickly → return mfa_required to UI immediately.
 * Phase 2: push poll / SMS code / workflow / re-login (same as Python client).
 *
 * Created by: Roy Dawson IV
 */

import {
  appendAuthLog,
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
import { isTauriShellSync } from './storagePaths.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** robin_stocks push + workflow polling */
const WORKFLOW_POLL_ATTEMPTS = 5;
const WORKFLOW_POLL_INTERVAL_MS = 2000;

const memoryChallenges = new Map();

/** Desktop: use proven robin_stocks Python bridge when available (user-verified MFA path). */
async function tryPythonRobinhoodLogin(profileId, username, password, mfaCode) {
  if (!isTauriShellSync()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const raw = await invoke('rh_python_login', {
      username,
      password,
      mfaCode: mfaCode || null,
      profileName: String(profileId),
    });
    if (!raw || typeof raw !== 'string') return null;
    const parsed = JSON.parse(raw.trim());
    console.info('[RobinhoodAuth] Python robin_stocks bridge:', parsed.status, parsed.challenge_type || '');
    await appendAuthLog(
      `python_bridge profile=${profileId} status=${parsed.status} challenge=${parsed.challenge_type || 'none'}`
    );
    return parsed;
  } catch (err) {
    console.warn('[RobinhoodAuth] Python bridge unavailable:', err?.message || err);
    return null;
  }
}

function mapPythonLoginResult(py) {
  return {
    status: py.status,
    mode: py.mode || 'live',
    message: py.message,
    challenge_type: py.challenge_type,
    challenge_issued: py.challenge_type === 'sms' || py.challenge_type === 'email',
    session: py.session,
    device_token: py.session?.device_token,
  };
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

  // Phase 1 returns immediately — robin_stocks blocks for minutes; our Python client
  // returned mfa_required instantly and let Phase 2 poll dynamically.
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

  console.info('[RobinhoodAuth] Phase 1 complete — returning mfa_required (prompt default).');

  return {
    status: 'mfa_required',
    mode: 'live',
    challenge_type: 'prompt',
    challenge_issued: false,
    message: mfaUserMessage('prompt', null),
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
  let active = await refreshPendingFromInquiries(pending);
  const challengeType = active.challenge_type;

  if (challengeType === 'prompt') {
    if (!active.challenge_id) {
      return {
        status: 'mfa_required',
        mode: 'live',
        challenge_type: 'prompt',
        challenge_issued: false,
        message: 'Waiting for Robinhood to send the app push notification. Keep the Robinhood app open.',
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
        message: 'Push not yet approved. Open your Robinhood app and approve the login.',
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
  if (!refreshToken) return null;
  const data = await requestPost(urls.login, buildRefreshPayload(refreshToken, deviceToken));
  if (!data?.access_token) return null;
  return sessionPayload(data, deviceToken);
}

export async function robinhoodLogin(profileId, username, password, mfaCode = null, options = {}) {
  if (isSandboxUsername(username)) {
    return {
      status: 'success',
      mode: 'sandbox',
      message: 'Connected to Sandbox Profile! Using Yahoo Finance quotes.',
    };
  }

  const vault = await getVaultPlugin();

  const pyResult = await tryPythonRobinhoodLogin(profileId, username, password, mfaCode);
  if (pyResult?.status) {
    const mapped = mapPythonLoginResult(pyResult);
    if (mapped.status === 'success' && mapped.mode === 'live' && mapped.session) {
      await saveSessionSafe(
        vault,
        profileId,
        sessionPayload(mapped.session, mapped.device_token || mapped.session.device_token),
        username
      );
      await clearChallengeSafe(vault, profileId);
    } else if (mapped.status === 'error') {
      await clearChallengeSafe(vault, profileId);
    }
    return {
      status: mapped.status,
      mode: mapped.mode,
      message: mapped.message,
      challenge_type: mapped.challenge_type,
      challenge_issued: mapped.challenge_issued ?? false,
    };
  }

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
  const vault = await getVaultPlugin();
  await clearChallengeSafe(vault, profileId);
  await vault.wipe({ profileId }).catch(() => {});
  return {
    status: 'success',
    message: 'Successfully logged out and wiped session from this device.',
  };
}

export async function robinhoodStatus(profileId) {
  const urls = await buildRhUrls();
  const vault = await getVaultPlugin();
  let username;
  let session;
  try {
    username = (await vault.getUsername({ profileId }))?.username || null;
    session = (await vault.loadSession({ profileId }))?.session || null;
  } catch {
    return { authenticated: false };
  }

  if (!username || !session) return { authenticated: false };

  let valid = await validateSession(session, urls);
  if (!valid) {
    const refreshed = await refreshSession(session, urls);
    if (refreshed) {
      await saveSessionSafe(vault, profileId, refreshed, username);
      valid = await validateSession(refreshed, urls);
    }
  }

  return valid ? { authenticated: true, username } : { authenticated: false };
}

export async function robinhoodSyncHoldings(profileId) {
  const urls = await buildRhUrls();
  const vault = await getVaultPlugin();
  let session;
  try {
    session = (await vault.loadSession({ profileId }))?.session || null;
  } catch {
    throw new Error('Not authenticated. Please sign in first.');
  }

  if (!session) throw new Error('Not authenticated. Please sign in first.');

  let active = session;
  if (!(await validateSession(active, urls))) {
    const refreshed = await refreshSession(active, urls);
    if (refreshed) {
      const username = (await vault.getUsername({ profileId }))?.username || '';
      await saveSessionSafe(vault, profileId, refreshed, username);
      active = refreshed;
    }
  }

  if (!(await validateSession(active, urls))) {
    throw new Error('Robinhood session expired. Please sign in again.');
  }

  const auth = authHeader(active);
  const positions = await requestGet(urls.positions, auth);
  const results = positions?.results || [];
  const holdings = [];

  for (const pos of results) {
    const qty = parseFloat(pos.quantity || '0');
    if (qty <= 0) continue;
    const instrument = await requestGet(pos.instrument, auth);
    const symbol = instrument?.symbol;
    if (!symbol) continue;
    const avgBuy = parseFloat(pos.average_buy_price || '0');
    let price = avgBuy;
    const quote = await requestGet(urls.quotes(symbol), auth);
    if (quote?.last_trade_price) price = parseFloat(quote.last_trade_price);
    holdings.push({
      ticker: symbol,
      shares: qty,
      avg_buy_price: avgBuy,
      current_price: price,
    });
  }

  return { status: 'success', synced_count: holdings.length, holdings };
}
