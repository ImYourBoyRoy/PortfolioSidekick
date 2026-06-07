// ./frontend/src/app/components/SyncOverlay.jsx
/**
 * Fullscreen sync progress overlay.
 * Created by: Roy Dawson IV
 */
import { Brain } from 'lucide-react';
import { useSidekick } from '../context/SidekickContext';

export default function SyncOverlay() {
  const s = useSidekick();

  if (!s.syncing) return null;

  return (
    <div className="sync-overlay-fullscreen">
      <div className="sync-overlay-card">
        <div className="sync-spinner-ring">
          <div className="sync-spinner-pulse-core" />
          <Brain className="sync-spinner-icon-pulse" style={{ width: 28, height: 28, color: 'var(--color-buy)', position: 'absolute', zIndex: 3 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '950', color: '#fff', letterSpacing: '-0.02em' }}>
            Active Robinhood Link In Progress
          </h3>
          <span style={{ fontSize: '10px', color: 'var(--color-buy)', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Synchronizing Live Positions
          </span>
        </div>

        <p className="sync-step-fade-text">
          {s.syncStepIndex === 0 && 'Securing encrypted network tunnel to Robinhood APIs...'}
          {s.syncStepIndex === 1 && 'Authenticating local session with secure challenge tokens...'}
          {s.syncStepIndex === 2 && 'Retrieving portfolio asset positions and historical metrics...'}
          {s.syncStepIndex === 3 && 'Calibrating Multi-Horizon quantitative Trade Viability Oracle...'}
          {s.syncStepIndex === 4 && 'Synthesizing AI coaching insights in local Shadow Coach DB...'}
        </p>

        <p style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: '1.6', margin: '8px 0 0 0', maxWidth: '380px' }}>
          Your Robinhood session is stored only on this device. Credentials are never synced to other platforms or cloud servers. Please do not refresh or close the application during sync.
        </p>
      </div>
    </div>
  );
}
