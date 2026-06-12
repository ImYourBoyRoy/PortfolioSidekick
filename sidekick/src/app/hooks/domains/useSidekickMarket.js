// ./sidekick/src/app/hooks/domains/useSidekickMarket.js
/**
 * Market domain — strength analyzer, news, congressional trades, app updates, sandbox watchlist.
 * Created by: Roy Dawson IV
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  calculateMarketStrength,
  calculateLiveMarketStrength,
  computeWisestReallocationPicks,
  catalystNewsTickers,
  macroBriefNewsTickers,
  fetchMarketNews,
  formatNewsTime,
  fetchCongressTrades,
  formatCongressTradeDate,
  formatCongressSyncStatus,
  STOCK_ACT_MAX_LAG_DAYS,
  checkForAppUpdate,
  openUpdateDownload,
  copyUpdateDownloadUrl,
  getPreferredUpdateUrl,
} from '../../../serverless';
import { sidekickFetch } from '../../../lib/sidekickClient';
import { APP_VERSION } from '../../../lib/appVersion';

export function useSidekickMarket(shell, profilesDomain, portfolioDomain, bridgeApi) {
  const { activeTab, showToast } = shell;
  const { activeProfile } = profilesDomain;
  const { holdings, watchlist } = portfolioDomain;

  const [strengthTimeframe, setStrengthTimeframe] = useState('day');
  const [strengthSector, setStrengthSector] = useState('all');
  const [marketStrengthData, setMarketStrengthData] = useState(null);
  const [strengthLoading, setStrengthLoading] = useState(false);
  const [sandboxWatchlist, setSandboxWatchlist] = useState(() => {
    try {
      const saved = localStorage.getItem('st_sandbox');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [newSandboxTicker, setNewSandboxTicker] = useState('');
  const [newSandboxTargetPrice, setNewSandboxTargetPrice] = useState('');

  const [newsData, setNewsData] = useState(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [congressData, setCongressData] = useState(null);
  const [congressLoading, setCongressLoading] = useState(false);
  const [relativeTimeNow, setRelativeTimeNow] = useState(() => Date.now());
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateChecking, setUpdateChecking] = useState(false);

  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const fetchMarketStrength = useCallback(async () => {
    const useLive = activeTabRef.current === 'strength' && strengthTimeframe === 'day';
    setStrengthLoading(true);
    try {
      let data;
      try {
        const res = await sidekickFetch(
          `/advisor/market-strength?timeframe=${strengthTimeframe}&sector=${strengthSector}&live=${useLive ? 1 : 0}`,
        );
        if (!res.ok) throw new Error('API non-OK');
        data = await res.json();
      } catch (err) {
        console.warn('Serverless fallback: API strength query failed, running serverless engine:', err.message);
        try {
          data = useLive
            ? await calculateLiveMarketStrength(strengthTimeframe, strengthSector)
            : calculateMarketStrength(strengthTimeframe, strengthSector);
        } catch {
          data = calculateMarketStrength(strengthTimeframe, strengthSector);
        }
      }
      setMarketStrengthData(data);
    } catch (err) {
      console.error('Failed to load market strength data:', err);
    } finally {
      setStrengthLoading(false);
    }
  }, [strengthTimeframe, strengthSector]);

  useEffect(() => {
    if (activeTab === 'strength') {
      queueMicrotask(() => {
        void fetchMarketStrength();
      });
    }
  }, [activeTab, fetchMarketStrength]);

  useEffect(() => {
    localStorage.setItem('st_sandbox', JSON.stringify(sandboxWatchlist));
  }, [sandboxWatchlist]);

  const loadMarketNews = useCallback(async () => {
    setNewsLoading(true);
    try {
      const strengthDeck = calculateMarketStrength('day', 'all');
      const moverTickers = [
        ...(strengthDeck.top_gainers || []).map((m) => m.ticker),
        ...(strengthDeck.worst_decliners || []).map((m) => m.ticker),
      ];
      const extra = [
        ...holdings.map((h) => h.ticker),
        ...watchlist.map((w) => w.ticker),
        ...moverTickers,
        ...catalystNewsTickers(bridgeApi.current.getCatalystWatches?.() || []),
        ...macroBriefNewsTickers(),
      ];
      const result = await fetchMarketNews(extra);
      setNewsData(result);
    } catch {
      setNewsData({
        buckets: { today: [], week: [], month: [], year: [] },
        total: 0,
        fetchedAt: Date.now(),
        error: 'Unable to load market news right now.',
      });
    } finally {
      setNewsLoading(false);
    }
  }, [holdings, watchlist, bridgeApi]);

  const openNewsLink = useCallback((url) => {
    if (!url) return;
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      // no-op if the platform blocks external windows
    }
  }, []);

  const checkForUpdates = useCallback(async (force = false) => {
    setUpdateChecking(true);
    try {
      const result = await checkForAppUpdate(APP_VERSION, { force });
      setUpdateInfo(result);
      if (result.updateAvailable) {
        showToast(`Update v${result.latestVersion} is available on GitHub.`, 'info', 9000);
      } else if (force && !result.error) {
        showToast(`You are on the latest release (v${result.latestVersion || APP_VERSION}).`, 'success');
      }
    } catch (err) {
      const message = err?.message || 'Could not reach GitHub releases.';
      setUpdateInfo({ error: message, currentVersion: APP_VERSION, updateAvailable: false });
      if (force) showToast(message, 'warning');
    } finally {
      setUpdateChecking(false);
    }
  }, [showToast]);

  const downloadLatestUpdate = useCallback(async () => {
    const url = getPreferredUpdateUrl(updateInfo);
    if (!url) {
      showToast('No download URL yet — check for updates first.', 'warning');
      return;
    }
    const opened = await openUpdateDownload(url);
    if (!opened) {
      showToast('Could not open the download link. Use Copy update link instead.', 'warning', 9000);
    }
  }, [updateInfo, showToast]);

  const copyLatestUpdateLink = useCallback(async () => {
    const url = getPreferredUpdateUrl(updateInfo);
    if (!url) {
      showToast('No download URL yet — check for updates first.', 'warning');
      return;
    }
    const copied = await copyUpdateDownloadUrl(url);
    showToast(
      copied ? 'Update link copied to clipboard.' : 'Copy failed — open Settings again after checking for updates.',
      copied ? 'success' : 'warning',
      7000,
    );
  }, [updateInfo, showToast]);

  const loadCongressTrades = useCallback(async (force = false) => {
    setCongressLoading(true);
    try {
      const result = await fetchCongressTrades({ force });
      setCongressData(result);
    } catch {
      setCongressData({
        trades: [],
        total: 0,
        fetchedAt: Date.now(),
        error: 'Unable to load congressional trade disclosures.',
        disclaimer: '',
      });
    } finally {
      setCongressLoading(false);
    }
  }, []);

  const formatRelativeTime = useCallback(
    (timestamp) => formatNewsTime(timestamp, relativeTimeNow),
    [relativeTimeNow],
  );

  const congressSyncStatus = useMemo(
    () => formatCongressSyncStatus(congressData, relativeTimeNow),
    [congressData, relativeTimeNow],
  );

  useEffect(() => {
    if (activeTab !== 'news') return undefined;
    const id = setInterval(() => setRelativeTimeNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [activeTab]);

  useEffect(() => {
    if (!['news', 'insider'].includes(activeTab) || congressLoading || !congressData?.nextRefreshAt) return undefined;
    const delay = Math.max(0, congressData.nextRefreshAt - Date.now());
    const timer = setTimeout(() => void loadCongressTrades(true), delay);
    return () => clearTimeout(timer);
  }, [activeTab, congressData?.nextRefreshAt, congressLoading, loadCongressTrades]);

  useEffect(() => {
    const timer = setTimeout(() => void checkForUpdates(false), 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot startup update check
  }, []);

  useEffect(() => {
    if (activeTab === 'news' && !newsData && !newsLoading) {
      queueMicrotask(() => {
        void loadMarketNews();
      });
    }
    if (activeTab === 'insider' && !congressData && !congressLoading) {
      queueMicrotask(() => {
        void loadCongressTrades();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot load on tab open
  }, [activeTab]);

  useEffect(() => {
    if (!activeProfile) return;
    queueMicrotask(() => {
      void fetchMarketStrength();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- profile-scoped strength reload
  }, [activeProfile]);

  useEffect(() => {
    if (!activeProfile) return undefined;
    const interval = setInterval(() => {
      if (document.hidden) return;
      if (activeTab === 'strength') {
        void fetchMarketStrength();
      }
    }, 120_000);
    return () => clearInterval(interval);
  }, [activeProfile, activeTab, strengthTimeframe, strengthSector, fetchMarketStrength]);

  const wisestReallocationPicks = useMemo(() => {
    if (activeTab !== 'strength' && activeTab !== 'strategy') return [];
    return computeWisestReallocationPicks(5, holdings.map((h) => h.ticker));
  }, [holdings, activeTab]);

  return useMemo(() => ({
    strengthTimeframe,
    setStrengthTimeframe,
    strengthSector,
    setStrengthSector,
    marketStrengthData,
    strengthLoading,
    sandboxWatchlist,
    setSandboxWatchlist,
    newSandboxTicker,
    setNewSandboxTicker,
    newSandboxTargetPrice,
    setNewSandboxTargetPrice,
    fetchMarketStrength,
    newsData,
    newsLoading,
    loadMarketNews,
    congressData,
    congressLoading,
    loadCongressTrades,
    formatCongressTradeDate,
    congressSyncStatus,
    STOCK_ACT_MAX_LAG_DAYS,
    formatRelativeTime,
    updateInfo,
    updateChecking,
    checkForUpdates,
    downloadLatestUpdate,
    copyLatestUpdateLink,
    openNewsLink,
    computeWisestReallocationPicks,
    wisestReallocationPicks,
    calculateMarketStrength,
    formatNewsTime,
    APP_VERSION,
  }), [
    strengthTimeframe, strengthSector, marketStrengthData, strengthLoading,
    sandboxWatchlist, newSandboxTicker, newSandboxTargetPrice, fetchMarketStrength,
    newsData, newsLoading, loadMarketNews, congressData, congressLoading, loadCongressTrades,
    congressSyncStatus, formatRelativeTime, updateInfo, updateChecking, checkForUpdates,
    downloadLatestUpdate, copyLatestUpdateLink, openNewsLink, wisestReallocationPicks,
  ]);
}
