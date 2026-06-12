// ./sidekick/src/app/hooks/useSidekickApp.js
/**
 * Orchestrates domain hooks (shell, profiles, core) and binds the cross-domain bridge.
 * Created by: Roy Dawson IV
 */
import { useEffect, useMemo } from 'react';
import { useSidekickBridge } from './shared/useSidekickBridge';
import { useSidekickShell } from './domains/useSidekickShell';
import { useSidekickProfiles } from './domains/useSidekickProfiles';
import { useSidekickPortfolio } from './domains/useSidekickPortfolio';
import { useSidekickAuth } from './domains/useSidekickAuth';
import { useSidekickCoach } from './domains/useSidekickCoach';
import { useSidekickOracle } from './domains/useSidekickOracle';
import { useSidekickMarket } from './domains/useSidekickMarket';
import { useSidekickStrategy } from './domains/useSidekickStrategy';

/** @returns {{ shell: object, profiles: object, portfolio: object, auth: object, coach: object, oracle: object, market: object, strategy: object }} */
export function useSidekickDomains() {
  const bridgeApi = useSidekickBridge();
  const shell = useSidekickShell();
  const profiles = useSidekickProfiles(bridgeApi);
  const portfolio = useSidekickPortfolio(shell, profiles, bridgeApi);
  const market = useSidekickMarket(shell, profiles, portfolio, bridgeApi);
  const strategy = useSidekickStrategy(shell, profiles, portfolio, bridgeApi);
  const coach = useSidekickCoach(shell, profiles);
  const oracle = useSidekickOracle(shell, profiles, portfolio, strategy);
  const auth = useSidekickAuth(shell, profiles, portfolio, bridgeApi);

  useEffect(() => {
    Object.assign(bridgeApi.current, {
      showToast: shell.showToast,
      setIsProfileModalOpen: shell.setIsProfileModalOpen,
      setModalProfileName: shell.setModalProfileName,
      setNewProfileName: profiles.setNewProfileName,
      setLoading: shell.setLoading,
      getActiveProfile: () => profiles.activeProfile,
      setActiveProfile: profiles.setActiveProfile,
      setProfiles: profiles.setProfiles,
      refreshConnectionMode: portfolio.refreshConnectionMode,
      setSelectedTicker: strategy.setSelectedTicker,
      getSelectedTicker: () => strategy.selectedTicker,
      getChartData: () => strategy.chartData,
      getAdvisorData: () => strategy.advisorData,
      getViabilityData: () => strategy.viabilityData,
      getViabilityHorizon: () => strategy.viabilityHorizon,
      getCatalystWatches: () => oracle.catalystWatches,
      getIsLoginOpen: () => auth.isLoginOpen,
      setIsLoginOpen: auth.setIsLoginOpen,
      setLoginForm: auth.setLoginForm,
      setHasCachedRobinhoodSession: portfolio.setHasCachedRobinhoodSession,
      setIsSandbox: portfolio.setIsSandbox,
      getActiveTab: () => shell.activeTab,
      getDebugMode: () => strategy.debugMode,
      loginGraceUntilRef: auth.loginGraceUntilRef,
      loginSucceededRef: auth.loginSucceededRef,
      authProbeRef: auth.authProbeRef,
      getAuthProbe: () => auth.authProbeRef.current,
      setAuthProbe: (authenticated) => {
        auth.authProbeRef.current = { at: Date.now(), authenticated };
      },
      fetchGuesses: oracle.fetchGuesses,
      fetchAnalytics: oracle.fetchAnalytics,
      fetchShadowCoachData: coach.fetchShadowCoachData,
      fetchMarketStrength: market.fetchMarketStrength,
      fetchStockHistoryAndAdvisor: strategy.fetchStockHistoryAndAdvisor,
      fetchPortfolio: portfolio.fetchPortfolio,
      fetchWatchlist: portfolio.fetchWatchlist,
    });
  }, [bridgeApi, shell, profiles, portfolio, market, strategy, coach, oracle, auth]);

  return { shell, profiles, portfolio, auth, coach, oracle, market, strategy };
}

/** Flat legacy API — prefer domain hooks in new code. */
export function useSidekickApp() {
  const { shell, profiles, portfolio, auth, coach, oracle, market, strategy } = useSidekickDomains();
  return useMemo(
    () => ({ ...shell, ...profiles, ...portfolio, ...auth, ...coach, ...oracle, ...market, ...strategy }),
    [shell, profiles, portfolio, auth, coach, oracle, market, strategy],
  );
}
