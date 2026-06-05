// ./frontend/src/serverless/robinhoodAuth.js
/**
 * Two-phase Robinhood authentication for Android (and any JS-native runtime).
 * Logic is ported from backend/robinhood_client.py and robin_stocks open-source auth.
 * Pending challenges and sessions are persisted via the native vault plugin.
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

async function getVaultPlugin() {
  const { RobinhoodSession } = await import('../plugins/robinhood-session');
  return RobinhoodSession;
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

  let challengeType = null;
  let challengeId = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(2000);
    const inquiries = await requestGet(inquiriesUrl);
    const challenge = inquiries?.context?.sheriff_challenge;
    if (challenge) {
      challengeType = challenge.type || 'sms';
      challengeId = challenge.id || null;
      break;
    }
  }

  if (!challengeType) {
    challengeType = 'sms';
  }

  let message;
  if (challengeType === 'prompt') {
    message = "Approve this login request in your Robinhood mobile app, then click 'Confirm Approval'.";
  } else if (challengeType === 'email') {
    message = 'A verification code has been sent to your email. Enter it below.';
  } else {
    message = 'A verification code has been sent via SMS. Enter it below.';
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

async function completeChallenge(pending, mfaCode) {
  const challengeType = pending.challenge_type;

  if (challengeType === 'prompt') {
    if (pending.challenge_id) {
      const pushStatus = await requestGet(RH_URLS.pushStatus(pending.challenge_id));
      if (!pushStatus || pushStatus.challenge_status !== 'validated') {
        return {
          status: 'mfa_required',
          mode: 'live',
          challenge_type: 'prompt',
          message: 'Push not yet approved. Open your Robinhood app and approve the login, then try again.',
        };
      }
    }
  } else {
    if (!pending.challenge_id) {
      return {
        status: 'error',
        mode: 'live',
        message: 'No challenge ID found. Please restart login.',
      };
    }
    const challengeResp = await requestPost(
      RH_URLS.challengeRespond(pending.challenge_id),
      { response: mfaCode || '' }
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
      };
    }
  }

  let workflowApprovedFlag = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const inqResp = await requestPost(
      pending.inquiries_url,
      { sequence: 0, user_input: { status: 'continue' } },
      { json: true }
    );
    if (workflowApproved(inqResp)) {
      workflowApprovedFlag = true;
      break;
    }
    await sleep(2000);
  }

  if (!workflowApprovedFlag) {
    // robin_stocks proceeds after max retries; mirror Python client behavior.
  }

  const data = await requestPost(RH_URLS.login, pending.login_payload);
  if (data?.access_token) {
    return {
      status: 'success',
      mode: 'live',
      message: 'Successfully connected to Robinhood account!',
      session: data,
      device_token: pending.device_token,
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

export async function androidRobinhoodLogin(profileId, username, password, mfaCode = null) {
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
    await vault.saveChallenge({ profileId, pending: result.pending });
    return {
      status: result.status,
      mode: result.mode,
      challenge_type: result.challenge_type,
      message: result.message,
    };
  }

  if (result.status === 'success' && result.mode !== 'sandbox' && result.session) {
    await vault.saveSession({
      profileId,
      session: sessionPayload(result.session, result.device_token),
      username,
    });
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

export async function androidRobinhoodLogout(profileId) {
  const vault = await getVaultPlugin();
  await vault.wipe({ profileId }).catch(() => {});
  return {
    status: 'success',
    message: 'Successfully logged out and wiped session from this device.',
  };
}

export async function androidRobinhoodStatus(profileId) {
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
      await vault.saveSession({ profileId, session: refreshed, username });
      valid = await validateSession(refreshed);
    }
  }

  return valid ? { authenticated: true, username } : { authenticated: false };
}

export async function androidRobinhoodSyncHoldings(profileId) {
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
      await vault.saveSession({ profileId, session: refreshed, username });
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
