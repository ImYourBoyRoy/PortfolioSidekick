// ./sidekick/src/app/hooks/domains/useSidekickProfiles.js
/**
 * Profile domain — multi-portfolio CRUD and active profile selection.
 * Created by: Roy Dawson IV
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { localDb } from '../../../serverless';
import { sidekickFetch } from '../../../lib/sidekickClient';

export function useSidekickProfiles(bridgeApi) {
  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfile] = useState(null);
  const [newProfileName, setNewProfileName] = useState('');

  const fetchProfiles = useCallback(async (selectNewId = null) => {
    try {
      let data;
      try {
        const res = await sidekickFetch('/profiles');
        if (!res.ok) throw new Error('API profiles endpoint non-OK');
        data = await res.json();

        const localProfiles = localDb.getProfiles();
        let needsRefetch = false;
        for (const lp of localProfiles) {
          const existsInDb = data.some((bp) => bp.name.toLowerCase() === lp.name.toLowerCase());
          if (!existsInDb) {
            console.log(`Syncing local profile "${lp.name}" to local SQLite...`);
            try {
              await sidekickFetch('/profiles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: lp.name }),
              });
              needsRefetch = true;
            } catch (err) {
              console.warn(`Failed to sync profile "${lp.name}" via API:`, err.message);
            }
          }
        }
        if (needsRefetch) {
          const freshRes = await sidekickFetch('/profiles');
          if (freshRes.ok) data = await freshRes.json();
        }
      } catch (apiErr) {
        console.warn('Serverless fallback: API profiles fetch failed, reading localDb:', apiErr.message);
        data = localDb.getProfiles();
      }

      setProfiles(data);
      if (data.length > 0) {
        let nextProfile = null;
        if (selectNewId) {
          nextProfile = data.find((p) => p.id === selectNewId) || null;
        }
        if (!nextProfile) {
          const current = bridgeApi.current.getActiveProfile?.();
          const currentExists = current && data.find((p) => p.id === current.id);
          nextProfile = currentExists || data[0];
        }
        setActiveProfile(nextProfile);
        await bridgeApi.current.refreshConnectionMode?.(nextProfile);
      } else {
        setActiveProfile(null);
        bridgeApi.current.setIsSandbox?.(true);
      }
    } catch (err) {
      console.error('Error loading profiles:', err);
    }
  }, [bridgeApi]);

  const handleCreateProfile = useCallback(async (name, seedDemo = false) => {
    if (!name.trim()) return;
    bridgeApi.current.setLoading?.(true);
    try {
      let profileId;
      try {
        const res = await sidekickFetch('/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim() }),
        });
        if (!res.ok) throw new Error('API profile create non-OK');
        const newP = await res.json();
        profileId = newP.id;

        if (seedDemo) {
          const defaults = [
            { ticker: 'QBTS', shares: 61.29, avg: 29.87 },
            { ticker: 'RGTI', shares: 45.56, avg: 25.41 },
            { ticker: 'NVDA', shares: 41.35, avg: 212.49 },
          ];
          for (const h of defaults) {
            await sidekickFetch('/portfolio/holdings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                profile_id: profileId,
                ticker: h.ticker,
                shares: h.shares,
                avg_buy_price: h.avg,
                current_price: h.avg,
              }),
            });
          }
          await sidekickFetch('/watchlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile_id: profileId, ticker: 'SPY', notes: 'Broad market standard index' }),
          });
          await sidekickFetch('/watchlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile_id: profileId, ticker: 'QQQ', notes: 'Tech heavy momentum index' }),
          });
          bridgeApi.current.showToast?.(`Demo profile "${name}" created with sample holdings.`, 'success');
        } else {
          bridgeApi.current.showToast?.(`Profile "${name}" is ready — add holdings manually or connect Robinhood.`, 'success');
        }
      } catch (apiErr) {
        console.warn('Serverless fallback: API profile creation failed, using localDb:', apiErr.message);
        const newP = localDb.createProfile(name);
        profileId = newP.id;

        if (seedDemo) {
          localDb.updateHolding(profileId, 'QBTS', 61.29, 29.87, 30.16);
          localDb.updateHolding(profileId, 'RGTI', 45.56, 25.41, 23.86);
          localDb.updateHolding(profileId, 'NVDA', 41.35, 212.49, 210.85);
          localDb.addToWatchlist(profileId, 'SPY', 'Broad market standard index');
          localDb.addToWatchlist(profileId, 'QQQ', 'Tech heavy momentum index');
          bridgeApi.current.showToast?.(`Demo profile "${name}" created with sandbox holdings.`, 'success');
        } else {
          bridgeApi.current.showToast?.(`Profile "${name}" is ready — add holdings manually or connect Robinhood.`, 'success');
        }
      }

      setNewProfileName('');
      bridgeApi.current.setModalProfileName?.('');
      bridgeApi.current.setIsProfileModalOpen?.(false);
      await fetchProfiles(profileId);
    } catch {
      bridgeApi.current.showToast?.('Profile creation failed.', 'error');
    } finally {
      bridgeApi.current.setLoading?.(false);
    }
  }, [bridgeApi, fetchProfiles]);

  const handleDeleteProfile = useCallback(async (profileId) => {
    if (!profileId) return;
    const name = activeProfile?.name || 'selected';
    const confirmDelete = window.confirm(
      `Are you absolutely sure you want to permanently delete the profile "${name}"? This deletes all associated holdings, price predictions, and weight evolution records.`,
    );
    if (!confirmDelete) return;

    bridgeApi.current.setLoading?.(true);
    try {
      try {
        const res = await sidekickFetch(`/profiles/${profileId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('API delete profile non-OK');
        alert(`Profile "${name}" was successfully removed.`);
      } catch (apiErr) {
        console.warn('Serverless fallback: API profile deletion failed, using localDb:', apiErr.message);
        localDb.deleteProfile(profileId);
        alert(`Profile "${name}" was successfully removed.`);
      }
      await fetchProfiles();
    } catch {
      alert('Failed to delete profile.');
    } finally {
      bridgeApi.current.setLoading?.(false);
    }
  }, [activeProfile, bridgeApi, fetchProfiles]);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchProfiles();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only bootstrap
  }, []);

  return useMemo(() => ({
    profiles,
    setProfiles,
    activeProfile,
    setActiveProfile,
    newProfileName,
    setNewProfileName,
    fetchProfiles,
    handleCreateProfile,
    handleDeleteProfile,
  }), [
    profiles, activeProfile, newProfileName,
    fetchProfiles, handleCreateProfile, handleDeleteProfile,
  ]);
}
