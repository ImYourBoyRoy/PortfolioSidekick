// ./frontend/src/serverless/robinhoodAuth.js
/**
 * Two-phase Robinhood authentication for all platforms (Android, desktop, dev).
 * Logic is ported from backend/robinhood_client.py and embedded robin_stocks semantics.
 * Sessions persist via the RobinhoodSession vault plugin.
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

const CHALLENGE_POLL_ATTEMPTS = 30;
const CHALLENGE_POLL_INTERVAL_MS = 2000;
const WORKFLOW_POLL_ATTEMPTS = 8;
const WORKFLOW_POLL_INTERVAL_MS = 2000;

async function getVaultPlugin() {
  const { RobinhoodSession } = await import('../plugins/robinhood-session');
  return RobinhoodSession;
}

async function saveChallengeSafe(vault, profileId, pending) {
  try {
    await vault.saveChallenge({ profileId, pending });
  } catch (err) {
    console.warn('[RobinhoodAuth] Vault challenge save failed, using in-memory pending only:', err);
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

async function pollSheriffChallenge(inquiriesUrl, maxAttempts = CHALLENGE_POLL_ATTEMPTS) {
  let challengeType = null;
  let challengeId = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(CHALLENGE_POLL_INTERVAL_MS);
    }
    const inquiries = await requestGet(inquiriesUrl);
    const challenge = extractSheriffChallenge(inquiries);
    if (challenge) {
      challengeType = challenge.challenge_type;
      challengeId = challenge.challenge_id;
      if (challengeId) break;
    }
  }

  return {
    challenge_type: challengeType || 'sms',
    challenge_id: challengeId,
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
  const { challenge_type: challengeType, challenge_id: challengeId } = await pollSheriffChallenge(inquiriesUrl);

  let message;
  if (challengeType === 'prompt') {
    message = challengeId
      ? 'Approve this login in your Robinhood mobile app. We will detect approval automatically.'
      : 'Approve this login in your Robinhood mobile app, then click Confirm Approval.';
  } else if (challengeType === 'email') {
    message = challengeId
      ? 'A verification code has been sent to your email. Enter it below.'
      : 'Robinhood is preparing email verification. Wait a moment, then enter the code when it arrives.';
  } else {
    message = challengeId
      ? 'A verification code has been sent via SMS. Enter it below.'
      : 'Robinhood is preparing SMS verification. Wait a moment, then enter the code when it arrives.';
  }

  return {
    status: 'mfa_required',
    mode: 'live',
    challenge_type: challengeType,
    message,
    pending: {
      device_token: deviceToken,
      login_payload: loginPayload,
      workflow_id: workflowId,
      machine_id: machineId,
      challenge_type: challengeType,
      challenge_id: challengeId,
      inquiries_url: inquiriesUrl,
    },
  };
}

async function resolveChallengeId(pending) {
  if (pending.challenge_id) return pending.challenge_id;
  const refreshed = await pollSheriffChallenge(pending.inquiries_url, 15);
  if (refreshed.challenge_id) {
    pending.challenge_id = refreshed.challenge_id;
    if (refreshed.challenge_type) pending.challenge_type = refreshed.challenge_type;
    return refreshed.challenge_id;
  }
  return null;
}

async function completeChallenge(pending, mfaCode) {
  const challengeType = pending.challenge_type;
  let activePending = { ...pending };

  if (challengeType === 'prompt') {
    let challengeId = await resolveChallengeId(activePending);
    if (!challengeId) {
      return {
        status: 'mfa_required',
        mode: 'live',
        challenge_type: 'prompt',
        message: 'Waiting for Robinhood to issue the app push challenge. Keep the Robinhood app open and try again shortly.',
        pending: activePending,
      };
    }

    const pushStatus = await requestGet(RH_URLS.pushStatus(challengeId));
    if (!pushStatus || pushStatus.challenge_status !== 'validated') {
      return {
        status: 'mfa_required',
        mode: 'live',
        challenge_type: 'prompt',
        message: 'Push not yet approved. Open your Robinhood app and approve the login, then try again.',
        pending: activePending,
      };
    }
  } else {
    const challengeId = await resolveChallengeId(activePending);
    if (!challengeId) {
      return {
        status: 'mfa_required',
        mode: 'live',
        challenge_type: challengeType,
        message: 'Robinhood has not issued a verification code yet. Wait a few seconds and submit your code again.',
        pending: activePending,
      };
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
      RH_URLS.challengeRespond(challengeId),
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

  let workflowApprovedFlag = false;
  for (let attempt = 0; attempt < WORKFLOW_POLL_ATTEMPTS; attempt++) {
    const inqResp = await requestPost(
      activePending.inquiries_url,
      { sequence: 0, user_input: { status: 'continue' } },
      { json: true }
    );
    if (workflowApproved(inqResp)) {
      workflowApprovedFlag = true;
      break;
    }
    if (attempt < WORKFLOW_POLL_ATTEMPTS - 1) {
      await sleep(WORKFLOW_POLL_INTERVAL_MS);
    }
  }

  if (!workflowApprovedFlag) {
    // Mirror Python client: proceed even if workflow approval was not explicit.
  }

  const data = await requestPost(RH_URLS.login, activePending.login_payload);
  if (data?.access_token) {
    return {
      status: 'success',
      mode: 'live',
      message: 'Successfully connected to Robinhood account!',
      session: data,
      device_token: activePending.device_token,
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
  let pending = null;
  try {
    const loaded = await vault.loadChallenge({ profileId });
    pending = loaded?.pending || null;
  } catch {
    // Vault unavailable — start a fresh login attempt.
  }

  const isPushPending = pending?.challenge_type === 'prompt';
  let result;

  if ((mfaCode || isPushPending) && pending) {
    result = await completeChallenge(pending, mfaCode);
    if (result.pending) {
      await saveChallengeSafe(vault, profileId, result.pending);
    }
  } else {
    await vault.clearChallenge({ profileId }).catch(() => {});
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
    await vault.clearChallenge({ profileId }).catch(() => {});
  } else if (result.status === 'error') {
    await vault.clearChallenge({ profileId }).catch(() => {});
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
