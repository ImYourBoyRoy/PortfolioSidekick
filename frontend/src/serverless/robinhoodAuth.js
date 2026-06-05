// ./frontend/src/serverless/robinhoodAuth.js
/**
 * Two-phase Robinhood authentication for all platforms (Android, desktop, dev).
 * Sheriff challenge + workflow polling mirrors robin_stocks authentication.py
 * (_validate_sherrif_id) and backend/robinhood_client.py.
 *
 * Created by: Roy Dawson IV
 */

import {
  RH_URLS,
  authHeader,
  buildLoginPayload,
  buildRefreshPayload,
  generateDeviceToken,
  requestGet,
  requestPost,
  sessionPayload,
} from './robinhoodAuthCore';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** robin_stocks uses 5s polling for up to 120s during sheriff verification. */
const SHERIFF_POLL_INTERVAL_MS = 5000;
const SHERIFF_POLL_TIMEOUT_MS = 120000;
const WORKFLOW_POLL_ATTEMPTS = 10;
const WORKFLOW_POLL_INTERVAL_MS = 5000;
const PUSH_POLL_ATTEMPTS = 12;
const PUSH_POLL_INTERVAL_MS = 5000;

/** In-memory fallback when vault/fs writes fail during MFA. */
const memoryChallenges = new Map();

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

/**
 * Mirrors robin_stocks _validate_sherrif_id polling semantics.
 * Returns when challenge is actionable, already validated, or timeout.
 */
async function pollSheriffChallenge(inquiriesUrl) {
  const started = Date.now();
  let lastSeen = null;

  while (Date.now() - started < SHERIFF_POLL_TIMEOUT_MS) {
    if (Date.now() - started > 0) {
      await sleep(SHERIFF_POLL_INTERVAL_MS);
    }

    const inquiries = await requestGet(inquiriesUrl);
    const challenge = extractSheriffChallenge(inquiries);
    if (!challenge) continue;

    lastSeen = challenge;

    if (challenge.challenge_status === 'validated') {
      return { ...challenge, ready: true, ready_phase: 'validated' };
    }

    if (challenge.challenge_type === 'prompt' && challenge.challenge_id) {
      return { ...challenge, ready: true, ready_phase: 'prompt' };
    }

    if (
      ['sms', 'email'].includes(challenge.challenge_type)
      && challenge.challenge_id
      && challenge.challenge_status === 'issued'
    ) {
      return { ...challenge, ready: true, ready_phase: 'code' };
    }
  }

  return {
    challenge_type: lastSeen?.challenge_type || 'sms',
    challenge_id: lastSeen?.challenge_id || null,
    challenge_status: lastSeen?.challenge_status || null,
    ready: false,
    ready_phase: 'timeout',
  };
}

async function pollWorkflowApproval(inquiriesUrl) {
  for (let attempt = 0; attempt < WORKFLOW_POLL_ATTEMPTS; attempt++) {
    const inqResp = await requestPost(
      inquiriesUrl,
      { sequence: 0, user_input: { status: 'continue' } },
      { json: true }
    );
    if (workflowApproved(inqResp)) {
      return true;
    }
    if (attempt < WORKFLOW_POLL_ATTEMPTS - 1) {
      await sleep(WORKFLOW_POLL_INTERVAL_MS);
    }
  }
  // robin_stocks proceeds after max retries.
  return false;
}

async function waitForPushValidated(challengeId) {
  for (let attempt = 0; attempt < PUSH_POLL_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(PUSH_POLL_INTERVAL_MS);
    }
    const pushStatus = await requestGet(RH_URLS.pushStatus(challengeId));
    if (pushStatus?.challenge_status === 'validated') {
      return true;
    }
  }
  return false;
}

async function finalizeLogin(loginPayload, deviceToken) {
  const data = await requestPost(RH_URLS.login, loginPayload);
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
    message: `Login failed after verification: ${data?.detail || 'Unknown error'}`,
  };
}

async function initiateChallenge(loginResponse, deviceToken, loginPayload) {
  const workflowId = loginResponse.verification_workflow.id;

  const machineData = await requestPost(
    RH_URLS.pathfinder,
    { device_id: deviceToken, flow: 'suv', input: { workflow_id: workflowId } },
    { json: true }
  );

  if (!machineData?.id) {
    return {
      status: 'error',
      mode: 'live',
      message: 'Failed to initiate Robinhood verification flow. Please try again.',
    };
  }

  const machineId = machineData.id;
  const inquiriesUrl = RH_URLS.inquiries(machineId);
  const challenge = await pollSheriffChallenge(inquiriesUrl);

  const pending = {
    device_token: deviceToken,
    login_payload: loginPayload,
    workflow_id: workflowId,
    machine_id: machineId,
    challenge_type: challenge.challenge_type,
    challenge_id: challenge.challenge_id,
    challenge_status: challenge.challenge_status,
    inquiries_url: inquiriesUrl,
  };

  if (challenge.ready_phase === 'validated') {
    await pollWorkflowApproval(inquiriesUrl);
    return finalizeLogin(loginPayload, deviceToken);
  }

  if (!challenge.ready) {
    return {
      status: 'error',
      mode: 'live',
      message: 'Robinhood did not issue a verification challenge in time. Check the Robinhood app, then try again.',
    };
  }

  let message;
  if (challenge.ready_phase === 'prompt') {
    message = 'Approve this login in your Robinhood mobile app. We will detect approval automatically.';
  } else if (challenge.challenge_type === 'email') {
    message = 'A verification code has been sent to your email. Enter it below.';
  } else {
    message = 'A verification code has been sent via SMS. Enter it below.';
  }

  return {
    status: 'mfa_required',
    mode: 'live',
    challenge_type: challenge.challenge_type,
    message,
    pending,
  };
}

async function refreshSheriffChallenge(pending) {
  const refreshed = await pollSheriffChallenge(pending.inquiries_url);
  if (refreshed.challenge_id) pending.challenge_id = refreshed.challenge_id;
  if (refreshed.challenge_type) pending.challenge_type = refreshed.challenge_type;
  if (refreshed.challenge_status) pending.challenge_status = refreshed.challenge_status;
  return refreshed;
}

async function completeChallenge(pending, mfaCode) {
  const activePending = { ...pending };
  const challengeType = activePending.challenge_type;

  if (challengeType === 'prompt') {
    let challengeId = activePending.challenge_id;
    if (!challengeId) {
      const refreshed = await refreshSheriffChallenge(activePending);
      challengeId = refreshed.challenge_id;
    }
    if (!challengeId) {
      return {
        status: 'mfa_required',
        mode: 'live',
        challenge_type: 'prompt',
        message: 'Waiting for Robinhood to issue the app push challenge. Keep the Robinhood app open.',
        pending: activePending,
      };
    }

    const approved = mfaCode
      ? (await requestGet(RH_URLS.pushStatus(challengeId)))?.challenge_status === 'validated'
      : await waitForPushValidated(challengeId);

    if (!approved) {
      return {
        status: 'mfa_required',
        mode: 'live',
        challenge_type: 'prompt',
        message: 'Push not yet approved. Open your Robinhood app and approve the login.',
        pending: activePending,
      };
    }
  } else {
    if (!activePending.challenge_id || activePending.challenge_status !== 'issued') {
      const refreshed = await refreshSheriffChallenge(activePending);
      if (!refreshed.ready || refreshed.ready_phase !== 'code') {
        return {
          status: 'mfa_required',
          mode: 'live',
          challenge_type: challengeType,
          message: 'Robinhood has not sent the verification code yet. Wait a few seconds and try again.',
          pending: activePending,
        };
      }
    }

    if (!mfaCode) {
      return {
        status: 'mfa_required',
        mode: 'live',
        challenge_type: challengeType,
        message: 'Enter the verification code sent by Robinhood.',
        pending: activePending,
      };
    }

    const challengeResp = await requestPost(
      RH_URLS.challengeRespond(activePending.challenge_id),
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
        message: `Invalid verification code (status: ${challengeResp.status || 'unknown'}). Please check and re-enter.`,
        pending: activePending,
      };
    }
  }

  await pollWorkflowApproval(activePending.inquiries_url);
  return finalizeLogin(activePending.login_payload, activePending.device_token);
}

async function validateSession(session) {
  const data = await requestGet(RH_URLS.positions, authHeader(session));
  return Boolean(data?.results);
}

async function refreshSession(session) {
  const refreshToken = session?.refresh_token;
  const deviceToken = session?.device_token || '';
  if (!refreshToken) return null;
  const data = await requestPost(RH_URLS.login, buildRefreshPayload(refreshToken, deviceToken));
  if (!data?.access_token) return null;
  return sessionPayload(data, deviceToken);
}

export async function robinhoodLogin(profileId, username, password, mfaCode = null) {
  if (isSandboxUsername(username)) {
    return {
      status: 'success',
      mode: 'sandbox',
      message: 'Connected to Sandbox Profile! Using Yahoo Finance quotes.',
    };
  }

  const vault = await getVaultPlugin();
  let pending = await loadChallengeState(vault, profileId);

  const isPushPending = pending?.challenge_type === 'prompt';
  let result;

  if ((mfaCode || isPushPending) && pending) {
    result = await completeChallenge(pending, mfaCode);
    if (result.pending) {
      await saveChallengeSafe(vault, profileId, result.pending);
    }
  } else {
    await clearChallengeSafe(vault, profileId);
    const deviceToken = generateDeviceToken();
    const loginPayload = buildLoginPayload(username, password, deviceToken);
    const data = await requestPost(RH_URLS.login, loginPayload);

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
      result = await initiateChallenge(data, deviceToken, loginPayload);
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
  const vault = await getVaultPlugin();
  let username;
  let session;
  try {
    username = (await vault.getUsername({ profileId }))?.username || null;
    session = (await vault.loadSession({ profileId }))?.session || null;
  } catch {
    return { authenticated: false };
  }

  if (!username || !session) {
    return { authenticated: false };
  }

  let valid = await validateSession(session);
  if (!valid) {
    const refreshed = await refreshSession(session);
    if (refreshed) {
      await saveSessionSafe(vault, profileId, refreshed, username);
      valid = await validateSession(refreshed);
    }
  }

  return valid ? { authenticated: true, username } : { authenticated: false };
}

export async function robinhoodSyncHoldings(profileId) {
  const vault = await getVaultPlugin();
  let session;
  try {
    session = (await vault.loadSession({ profileId }))?.session || null;
  } catch {
    throw new Error('Not authenticated. Please sign in first.');
  }

  if (!session) {
    throw new Error('Not authenticated. Please sign in first.');
  }

  let active = session;
  if (!(await validateSession(active))) {
    const refreshed = await refreshSession(active);
    if (refreshed) {
      const username = (await vault.getUsername({ profileId }))?.username || '';
      await saveSessionSafe(vault, profileId, refreshed, username);
      active = refreshed;
    }
  }

  if (!(await validateSession(active))) {
    throw new Error('Robinhood session expired. Please sign in again.');
  }

  const auth = authHeader(active);
  const positions = await requestGet(RH_URLS.positions, auth);
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
    const quote = await requestGet(RH_URLS.quotes(symbol), auth);
    if (quote?.last_trade_price) {
      price = parseFloat(quote.last_trade_price);
    }
    holdings.push({
      ticker: symbol,
      shares: qty,
      avg_buy_price: avgBuy,
      current_price: price,
    });
  }

  return {
    status: 'success',
    synced_count: holdings.length,
    holdings,
  };
}
