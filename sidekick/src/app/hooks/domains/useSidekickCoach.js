// ./sidekick/src/app/hooks/domains/useSidekickCoach.js
/**
 * Coach domain — Shadow Coach insights, action history, and coach time filtering.
 * Created by: Roy Dawson IV
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { localDb } from '../../../serverless';
import { sidekickFetch } from '../../../lib/sidekickClient';
import { getCoachActionCutoff } from '../../utils/formatters';

export function useSidekickCoach(shell, profilesDomain) {
  const { coachTimeFilter } = shell;
  const { activeProfile } = profilesDomain;

  const [coachLoading, setCoachLoading] = useState(false);
  const [shadowCoachData, setShadowCoachData] = useState(null);
  const [actionHistory, setActionHistory] = useState([]);

  const fetchShadowCoachData = useCallback(async (referenceTimeMs) => {
    if (!activeProfile) return;
    setCoachLoading(true);
    try {
      localDb.seedShadowCoachFromHoldings(activeProfile.id);
      let analysisData;
      let actionsData;
      try {
        const res = await sidekickFetch(`/shadow-coach/insights?profile_id=${activeProfile.id}`);
        if (!res.ok) throw new Error('Shadow Coach API non-OK');
        analysisData = await res.json();
        const actRes = await sidekickFetch(`/shadow-coach/actions?profile_id=${activeProfile.id}`);
        if (!actRes.ok) throw new Error('Actions API non-OK');
        actionsData = await actRes.json();
      } catch (apiErr) {
        console.warn('Serverless fallback: Shadow Coach API failed, using localDb:', apiErr.message);
        analysisData = localDb.analyzeActions(activeProfile.id);
        actionsData = localDb.getActions(activeProfile.id);
      }
      setShadowCoachData(analysisData);

      if (actionsData && actionsData.length > 0) {
        let filtered = actionsData;
        if (coachTimeFilter !== 'all') {
          const cutoff = getCoachActionCutoff(coachTimeFilter, referenceTimeMs);
          filtered = actionsData.filter((a) => new Date(a.timestamp).getTime() > cutoff);
        }
        setActionHistory(filtered);
      } else {
        setActionHistory([]);
      }
    } catch (err) {
      console.error('Error fetching Shadow Coach data:', err);
    } finally {
      setCoachLoading(false);
    }
  }, [activeProfile, coachTimeFilter]);

  useEffect(() => {
    if (!activeProfile) return;
    queueMicrotask(() => {
      void fetchShadowCoachData(Date.now());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- profile-scoped coach load
  }, [activeProfile]);

  useEffect(() => {
    if (!activeProfile) return;
    queueMicrotask(() => {
      void fetchShadowCoachData(Date.now());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when coach filter changes
  }, [coachTimeFilter, activeProfile]);

  return useMemo(() => ({
    coachLoading,
    shadowCoachData,
    setShadowCoachData,
    actionHistory,
    setActionHistory,
    fetchShadowCoachData,
    getCoachActionCutoff,
  }), [coachLoading, shadowCoachData, actionHistory, fetchShadowCoachData]);
}
