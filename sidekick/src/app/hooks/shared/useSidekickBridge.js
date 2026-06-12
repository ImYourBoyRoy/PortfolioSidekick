// ./sidekick/src/app/hooks/shared/useSidekickBridge.js
/**
 * Mutable ref bridge so domain hooks can call cross-domain APIs without
 * subscribing to each other's React state (avoids circular re-render chains).
 *
 * Created by: Roy Dawson IV
 */
import { useRef } from 'react';

export function useSidekickBridge() {
  const api = useRef({
    showToast: () => {},
    setIsProfileModalOpen: () => {},
    setNewProfileName: () => {},
    setModalProfileName: () => {},
    setLoading: () => {},
    getActiveProfile: () => null,
    setActiveProfile: () => {},
    setProfiles: () => {},
    refreshConnectionMode: async () => {},
    setSelectedTicker: () => {},
    getIsLoginOpen: () => false,
    setIsLoginOpen: () => {},
    setLoginForm: () => {},
    setHasCachedRobinhoodSession: () => {},
    setIsSandbox: () => {},
    getActiveTab: () => 'dashboard',
    getDebugMode: () => false,
    loginGraceUntilRef: { current: 0 },
    loginSucceededRef: { current: false },
    authProbeRef: { at: 0, authenticated: false },
    getAuthProbe: () => ({ at: 0, authenticated: false }),
    setAuthProbe: () => {},
    fetchGuesses: async () => {},
    fetchAnalytics: async () => {},
    fetchShadowCoachData: async () => {},
    fetchMarketStrength: async () => {},
    fetchStockHistoryAndAdvisor: async () => {},
    getSelectedTicker: () => '',
    getChartData: () => [],
    getAdvisorData: () => null,
    getViabilityData: () => null,
    getViabilityHorizon: () => 'week',
    getCatalystWatches: () => [],
  });
  return api;
}
