// ./sidekick/src/app/components/SyncOverlay.jsx
/**
 * Tab-content sync/bootstrap progress overlay (does not cover header or tab nav).
 * Created by: Roy Dawson IV
 */
import { useEffect, useState } from 'react';
import { Brain } from 'lucide-react';
import { usePortfolio } from '../context/SidekickContext';

const CANCEL_AFTER_MS = 60_000;

export default function SyncOverlay() {
  const {
    portfolioBootstrapping, syncing, syncStepIndex, cancelSync,
  } = usePortfolio();
  const [cancelReady, setCancelReady] = useState(false);

  const isBootstrap = portfolioBootstrapping && !syncing;

  useEffect(() => {
    const timer = setTimeout(() => setCancelReady(true), CANCEL_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  const title = isBootstrap
    ? 'Please Wait — Loading Portfolio'
    : 'Active Robinhood Link In Progress';
  const subtitle = isBootstrap
    ? 'Restoring saved session'
    : 'Synchronizing live positions';
  const hint = isBootstrap
    ? 'Your encrypted Robinhood session is on this device. We are restoring holdings and refreshing live quotes — this may take a few seconds.'
    : 'Your Robinhood session is stored only on this device. Credentials are never synced to other platforms or cloud servers.';

  return (
    <div className="sync-overlay-fullscreen" role="status" aria-live="polite" aria-busy="true">
      <div className="sync-overlay-card">
        <div className="sync-spinner-ring">
          <div className="sync-spinner-pulse-core" />
          <Brain className="sync-spinner-icon-pulse" style={{ width: 28, height: 28, color: 'var(--color-buy)', position: 'absolute', zIndex: 3 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '950', color: '#fff', letterSpacing: '-0.02em' }}>
            {title}
          </h3>
          <span style={{ fontSize: '10px', color: 'var(--color-buy)', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {subtitle}
          </span>
        </div>

        {!isBootstrap && (
          <p className="sync-step-fade-text">
            {syncStepIndex === 0 && 'Securing encrypted network tunnel to Robinhood APIs...'}
            {syncStepIndex === 1 && 'Authenticating local session with secure challenge tokens...'}
            {syncStepIndex === 2 && 'Retrieving portfolio asset positions and historical metrics...'}
            {syncStepIndex === 3 && 'Calibrating Multi-Horizon quantitative Trade Viability Oracle...'}
            {syncStepIndex === 4 && 'Synthesizing AI coaching insights in local Shadow Coach DB...'}
          </p>
        )}

        <p style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: '1.6', margin: '8px 0 0 0', maxWidth: '380px' }}>
          {hint}
        </p>

        {cancelReady && (
          <button
            type="button"
            className="sync-overlay-cancel-btn"
            onClick={() => cancelSync()}
          >
            Cancel sync
          </button>
        )}
      </div>
    </div>
  );
}
