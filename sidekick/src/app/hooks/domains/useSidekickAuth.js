// ./sidekick/src/app/hooks/domains/useSidekickAuth.js
/**
 * Auth domain — Robinhood login, MFA, session sync, and auto-restore bootstrap.
 * Created by: Roy Dawson IV
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { localDb, robinhoodClient } from '../../../serverless';
import { sidekickFetch, robinhoodTransportLabel, robinhoodLoginDebugHint } from '../../../lib/sidekickClient';
import { probeDesktopAuth, desktopAuthReadyMessage, authShellIsReady } from '../../../serverless/desktopAuthProbe';
import { waitForRobinhoodSession } from '../../../serverless/robinhoodAuth';

const SYNC_TIMEOUT_MS = 90_000;

export function useSidekickAuth(shell, profilesDomain, portfolioDomain, bridgeApi) {
  const { showToast, setLoading } = shell;
  const {
    activeProfile, setActiveProfile, setProfiles, fetchProfiles,
  } = profilesDomain;
  const {
    isSandbox, setIsSandbox,
    hasCachedRobinhoodSession, setHasCachedRobinhoodSession,
    setSyncing, setSyncStepIndex,
    setPortfolioBootstrapping,
    setLastSyncTime,
    autoRestoreNonce,
    syncCancelRef,
    fetchPortfolio, fetchWatchlist,
    refreshHiddenHoldings, runEquityDiagnostic,
  } = portfolioDomain;

  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '', mfa_code: '' });
  const [loginStatus, setLoginStatus] = useState({ status: '', message: '' });
  const [desktopAuthProbe, setDesktopAuthProbe] = useState(null);

  const loginSucceededRef = useRef(false);
  const loginGraceUntilRef = useRef(0);
  const mfaPollInFlightRef = useRef(false);
  const mfaPollStartedAtRef = useRef(0);
  const mfaPollFnRef = useRef(null);
  const authProbeRef = useRef({ at: 0, authenticated: false });

  useEffect(() => {
    let cancelled = false;
    void probeDesktopAuth().then((probe) => {
      if (!cancelled) setDesktopAuthProbe(probe);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const openRobinhoodLogin = useCallback(() => {
    if (!activeProfile) {
      showToast('Create a profile first.', 'warning');
      return;
    }
    setLoginForm((prev) => ({
      ...prev,
      username: activeProfile.robinhood_username || prev.username,
      password: '',
      mfa_code: '',
    }));
    setLoginStatus({ status: '', message: '' });
    setLoading(false);
    setIsLoginOpen(true);
  }, [activeProfile, showToast, setLoading]);

  const raceSyncDeadline = useCallback((promise, label, deadlineMs) => {
    const remaining = Math.max(0, deadlineMs - Date.now());
    if (remaining <= 0) {
      return Promise.reject(new Error(`${label} timed out after 90 seconds.`));
    }
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`${label} timed out after 90 seconds.`)), remaining);
      }),
    ]);
  }, []);

  const applyAuthenticatedStatus = useCallback((statusData) => {
    setIsSandbox(false);
    if (statusData.username && !activeProfile?.robinhood_username) {
      setActiveProfile((prev) => (prev ? { ...prev, robinhood_username: statusData.username } : prev));
      setProfiles((prev) => prev.map((p) => (
        p.id === activeProfile?.id ? { ...p, robinhood_username: statusData.username } : p
      )));
    }
  }, [activeProfile, setActiveProfile, setProfiles, setIsSandbox]);

  const triggerSync = useCallback(async (overrideSandbox = null, options = {}) => {
    if (!activeProfile) return;

    const refreshAfterSync = async () => {
      const bridge = bridgeApi.current;
      const selectedTicker = bridge.getSelectedTicker?.();
      await Promise.all([
        fetchPortfolio(),
        bridge.fetchGuesses?.(),
        bridge.fetchAnalytics?.(),
        fetchWatchlist(),
        bridge.fetchShadowCoachData?.(Date.now()),
        bridge.fetchMarketStrength?.(),
        selectedTicker ? bridge.fetchStockHistoryAndAdvisor?.() : Promise.resolve(),
      ]);
      if (bridge.getDebugMode?.() === true) {
        void runEquityDiagnostic(true);
      }
    };

    const isManual = !options.silent && !options.bootstrap;
    syncCancelRef.current = false;
    let overlayActive = false;
    const syncDeadline = Date.now() + SYNC_TIMEOUT_MS;

    const startOverlay = () => {
      overlayActive = true;
      setSyncStepIndex(0);
      setSyncing(true);
    };

    const stopOverlay = () => {
      if (!overlayActive) return;
      overlayActive = false;
      setSyncing(false);
      setSyncStepIndex(0);
    };

    if (isManual) {
      startOverlay();
      showToast('Connecting to your saved Robinhood session…', 'info', 3500);
    }

    const resolveRobinhoodSession = async () => {
      if (options.afterLogin) {
        let ready = await waitForRobinhoodSession(activeProfile.id, 12, 200);
        if (!ready) ready = await waitForRobinhoodSession(activeProfile.id, 8, 300);
        if (ready) return true;
        return loginSucceededRef.current
          || Boolean(activeProfile.robinhood_username)
          || hasCachedRobinhoodSession;
      }

      const cachedSession = hasCachedRobinhoodSession || Boolean(activeProfile.robinhood_username);
      if (cachedSession) {
        const ready = await waitForRobinhoodSession(activeProfile.id, 20, 250);
        if (ready) return true;
      }

      try {
        const statusRes = await sidekickFetch(`/auth/status?profile_id=${activeProfile.id}`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (statusData.authenticated) {
            applyAuthenticatedStatus(statusData);
            return true;
          }
        }
      } catch {
        // Fall through to login prompt when no live session.
      }
      return false;
    };

    try {
      const canSyncLive = await raceSyncDeadline(
        resolveRobinhoodSession(),
        'Session check',
        syncDeadline,
      );

      if (syncCancelRef.current) return;

      if (!canSyncLive) {
        if (!options.silent && !options.bootstrap) {
          if (!options.afterLogin) {
            openRobinhoodLogin();
            const hadSession = Boolean(activeProfile.robinhood_username) || hasCachedRobinhoodSession;
            showToast(
              hadSession
                ? 'Robinhood session expired. Sign in again to sync live holdings.'
                : 'Sign in with Robinhood to sync your stock and ETF positions.',
              'info',
            );
          } else {
            showToast(
              'Signed in, but live sync could not start yet. Tap Sync Account — if it fails, check adb logcat -s RobinhoodAuth.',
              'warning',
              10000,
            );
          }
        }
        return;
      }

      if (!overlayActive) startOverlay();

      const targetSandbox = overrideSandbox !== null ? overrideSandbox : false;
      const data = await raceSyncDeadline(
        robinhoodClient.syncHoldings(activeProfile.id, targetSandbox),
        'Robinhood sync',
        syncDeadline,
      );

      if (syncCancelRef.current) return;

      const markSyncCompleted = () => {
        const now = new Date();
        setLastSyncTime(now);
        localStorage.setItem(`st_last_sync_${activeProfile.id}`, now.toISOString());
      };

      if (!options.silent) {
        const debugMode = bridgeApi.current.getDebugMode?.() === true;
        if (data.synced_count > 0) {
          showToast(`Successfully synced ${data.synced_count} active positions from Robinhood!`, 'success');
        } else {
          showToast(
            debugMode
              ? 'Sync completed: 0 active stock holdings found. Options and crypto are not imported — add stocks manually or paste a holdings list.'
              : 'Sync completed: 0 active stock holdings found. Options and crypto are not imported.',
            'warning',
            7000,
          );
        }
      }

      markSyncCompleted();

      loginGraceUntilRef.current = Date.now() + 30_000;
      refreshHiddenHoldings();
      await refreshAfterSync();
      stopOverlay();
    } catch (err) {
      if (!syncCancelRef.current && !options.silent) {
        showToast(err.message || 'Error linking with Robinhood client.', 'error');
      }
      console.error('Sync error:', err);
    } finally {
      stopOverlay();
      if (options.afterLogin || options.bootstrap) {
        setPortfolioBootstrapping(false);
      }
      if (!syncCancelRef.current && activeProfile && (options.afterLogin || overlayActive)) {
        try {
          await fetchPortfolio();
        } catch (refreshErr) {
          console.warn('Post-sync portfolio refresh failed:', refreshErr);
        }
      }
    }
  }, [
    activeProfile, hasCachedRobinhoodSession, syncCancelRef,
    setSyncStepIndex, setSyncing, showToast, raceSyncDeadline,
    applyAuthenticatedStatus, openRobinhoodLogin, refreshHiddenHoldings,
    fetchPortfolio, fetchWatchlist, runEquityDiagnostic, setPortfolioBootstrapping, setLastSyncTime, bridgeApi,
  ]);

  useEffect(() => {
    if (autoRestoreNonce === 0 || !activeProfile) return undefined;
    let cancelled = false;
    const runRestore = async () => {
      try {
        await triggerSync(null, { afterLogin: true, silent: true, bootstrap: true });
      } catch (err) {
        if (!cancelled) console.warn('Portfolio auto-restore failed:', err);
      } finally {
        if (!cancelled) setPortfolioBootstrapping(false);
      }
    };
    void runRestore();
    return () => {
      cancelled = true;
    };
  }, [autoRestoreNonce, activeProfile, triggerSync, setPortfolioBootstrapping]);

  const handleStayOffline = useCallback(() => {
    setIsLoginOpen(false);
    setLoginForm({ username: '', password: '', mfa_code: '' });
    setLoginStatus({ status: '', message: '' });
    setLoading(false);
    setIsSandbox(true);
    showToast('Staying offline. Add holdings manually, paste a list, or seed sandbox assets.', 'info');
  }, [setLoading, setIsSandbox, showToast]);

  const applyLoginResult = useCallback(async (data, options = {}) => {
    if (loginSucceededRef.current) return;

    if (data.status === 'success') {
      loginSucceededRef.current = true;
      loginGraceUntilRef.current = Date.now() + 45_000;
      mfaPollInFlightRef.current = false;
      const newSandbox = data.mode === 'sandbox';
      const linkedUsername = loginForm.username?.trim() || activeProfile?.robinhood_username || '';
      setIsSandbox(newSandbox);
      if (!newSandbox) {
        setHasCachedRobinhoodSession(true);
        setPortfolioBootstrapping(true);
        if (activeProfile?.id && linkedUsername) {
          localDb.setRobinhoodUsername(activeProfile.id, linkedUsername);
          setActiveProfile((prev) => (prev ? { ...prev, robinhood_username: linkedUsername } : prev));
          setProfiles((prev) => prev.map((p) => (
            p.id === activeProfile.id ? { ...p, robinhood_username: linkedUsername } : p
          )));
        }
      }
      setIsLoginOpen(false);
      setLoginForm({ username: '', password: '', mfa_code: '' });
      setLoginStatus({ status: '', message: '' });
      setLoading(false);
      showToast(data.message || 'Connected to Robinhood! Syncing holdings…', 'success');
      if (activeProfile?.id) {
        await fetchProfiles(activeProfile.id);
      }
      await triggerSync(newSandbox, { afterLogin: true });
      return;
    }

    if (data.status === 'mfa_required') {
      setLoginStatus({
        status: 'mfa_required',
        message: data.message || 'Complete Robinhood verification below.',
        challenge_type: data.challenge_type || 'prompt',
        challenge_issued: data.challenge_issued ?? false,
      });
      setLoading(false);
      return;
    }

    if (options.fromMfaPoll && loginStatus.status === 'mfa_required') {
      setLoginStatus((prev) => ({
        ...prev,
        status: 'mfa_required',
        message: data.message || prev.message || 'Waiting for Robinhood approval…',
      }));
      setLoading(false);
      return;
    }

    setLoginStatus({ status: 'error', message: data.message || 'Authentication failed.' });
    setLoading(false);
  }, [
    activeProfile, loginForm.username, loginStatus.status,
    setIsSandbox, setHasCachedRobinhoodSession, setPortfolioBootstrapping,
    setActiveProfile, setProfiles, setLoading, showToast, fetchProfiles, triggerSync,
  ]);

  const handleLogin = useCallback(async (e) => {
    e.preventDefault();
    if (
      loginStatus.status !== 'mfa_required'
      && desktopAuthProbe
      && ['desktop', 'android'].includes(desktopAuthProbe.platform)
      && !authShellIsReady(desktopAuthProbe)
    ) {
      setLoginStatus({
        status: 'error',
        message: desktopAuthReadyMessage(desktopAuthProbe),
      });
      return;
    }

    if (loginStatus.status === 'mfa_required') {
      const needsCode = ['sms', 'email'].includes(loginStatus.challenge_type);
      if (needsCode && loginStatus.challenge_issued) {
        if (!loginForm.mfa_code?.trim()) {
          setLoginStatus((prev) => ({
            ...prev,
            message: `Enter the ${loginStatus.challenge_type} verification code below.`,
          }));
          return;
        }
        setLoading(true);
        try {
          const data = await robinhoodClient.login(
            activeProfile.id,
            loginForm.username,
            loginForm.password,
            loginForm.mfa_code.trim(),
            { continueMfa: true },
          );
          await applyLoginResult(data);
        } catch (err) {
          setLoginStatus({ status: 'error', message: err.message || 'Verification failed. Please restart login.' });
          setLoading(false);
        }
      }
      return;
    }

    loginSucceededRef.current = false;
    loginGraceUntilRef.current = 0;
    mfaPollInFlightRef.current = false;
    setLoading(true);
    const transport = robinhoodTransportLabel();
    setLoginStatus({ status: 'processing', message: `Contacting Robinhood API (${transport})...` });
    const slowTimer = setTimeout(() => {
      setLoginStatus((prev) => (
        prev.status === 'processing'
          ? { ...prev, message: `Still contacting Robinhood (${transport}, up to 60s).${robinhoodLoginDebugHint()}` }
          : prev
      ));
    }, 4000);

    try {
      const data = await robinhoodClient.login(
        activeProfile.id,
        loginForm.username,
        loginForm.password,
        null,
      );
      await applyLoginResult(data);
    } catch (err) {
      const hint = err.message?.includes('timed out') || err.message?.includes('auth.log')
        ? robinhoodLoginDebugHint()
        : '';
      setLoginStatus({
        status: 'error',
        message: (err.message || 'Robinhood sign-in failed. Check credentials or stay offline.') + hint,
      });
      setLoading(false);
    } finally {
      clearTimeout(slowTimer);
    }
  }, [
    loginStatus, desktopAuthProbe, loginForm, activeProfile,
    setLoading, applyLoginResult,
  ]);

  useEffect(() => {
    if (loginStatus.status !== 'mfa_required' || !activeProfile) return undefined;

    let cancelled = false;
    let appListener = null;
    let foregroundTimer = null;

    const pollMfa = async () => {
      if (cancelled || loginSucceededRef.current) return;
      if (mfaPollInFlightRef.current) return;
      mfaPollInFlightRef.current = true;
      mfaPollStartedAtRef.current = Date.now();
      try {
        const needsCode = ['sms', 'email'].includes(loginStatus.challenge_type);
        const optionalPromptCode = loginStatus.challenge_type === 'prompt'
          ? (loginForm.mfa_code?.trim() || null)
          : null;
        const code = needsCode && loginStatus.challenge_issued
          ? (loginForm.mfa_code?.trim() || null)
          : optionalPromptCode;
        const data = await robinhoodClient.login(
          activeProfile.id,
          loginForm.username,
          loginForm.password,
          code,
          { continueMfa: true },
        );
        if (cancelled || loginSucceededRef.current) return;
        await applyLoginResult(data, { fromMfaPoll: true });
      } catch (err) {
        console.warn('[RobinhoodAuth] MFA poll error:', err?.message || err);
      } finally {
        mfaPollInFlightRef.current = false;
      }
    };

    mfaPollFnRef.current = pollMfa;

    const onForeground = () => {
      if (cancelled || loginSucceededRef.current || mfaPollInFlightRef.current) return;
      clearTimeout(foregroundTimer);
      foregroundTimer = setTimeout(() => {
        void pollMfa();
      }, 2000);
    };

    void pollMfa();
    const interval = setInterval(() => {
      void pollMfa();
    }, 10000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onForeground();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onForeground);

    import('@capacitor/app')
      .then(({ App }) => App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) onForeground();
      }))
      .then((handle) => {
        appListener = handle;
      })
      .catch(() => {
        // @capacitor/app optional — visibility/focus handlers cover WebView resume.
      });

    return () => {
      cancelled = true;
      clearTimeout(foregroundTimer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onForeground);
      mfaPollFnRef.current = null;
      appListener?.remove?.();
    };
  }, [
    loginStatus.status, loginStatus.challenge_type, loginStatus.challenge_issued,
    loginForm.mfa_code, loginForm.username, loginForm.password, activeProfile, applyLoginResult,
  ]);

  const handleLogout = useCallback(async () => {
    if (!activeProfile) return;
    setLoading(true);
    try {
      const data = await robinhoodClient.logout(activeProfile.id, isSandbox);
      showToast(data.message || 'Successfully logged out and wiped session!', 'success');
      loginSucceededRef.current = false;
      loginGraceUntilRef.current = 0;
      setIsSandbox(true);
      await fetchProfiles(activeProfile.id);
    } catch (err) {
      console.error('Logout error:', err);
      showToast(err.message || 'Failed to log out securely.', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeProfile, isSandbox, setLoading, setIsSandbox, showToast, fetchProfiles]);

  return useMemo(() => ({
    isLoginOpen,
    setIsLoginOpen,
    loginForm,
    setLoginForm,
    loginStatus,
    setLoginStatus,
    desktopAuthProbe,
    desktopAuthReadyMessage,
    authShellIsReady,
    loginGraceUntilRef,
    loginSucceededRef,
    authProbeRef,
    openRobinhoodLogin,
    triggerSync,
    handleStayOffline,
    handleLogin,
    handleLogout,
  }), [
    isLoginOpen, loginForm, loginStatus, desktopAuthProbe,
    openRobinhoodLogin, triggerSync, handleStayOffline, handleLogin, handleLogout,
  ]);
}
