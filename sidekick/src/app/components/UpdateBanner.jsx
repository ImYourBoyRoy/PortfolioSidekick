// ./sidekick/src/app/components/UpdateBanner.jsx
/**
 * Persistent banner when a newer GitHub release is available.
 */
import { Download, RefreshCw, X } from 'lucide-react';
import { useSidekick } from '../context/SidekickContext';

export default function UpdateBanner() {
  const s = useSidekick();
  const info = s.updateInfo;

  if (!info?.updateAvailable || s.updateInstalling || !s.updateBannerVisible) return null;

  const platformLabel = info.platform ? `${info.platform} build` : 'your platform';

  return (
    <div className="update-banner animate-fade-in" role="status" aria-live="polite">
      <div className="update-banner-copy">
        <strong>Update available — v{info.latestVersion}</strong>
        <span>
          You are on v{info.currentVersion || s.APP_VERSION}. Apply the portable {platformLabel} build — Sidekick restarts automatically on desktop.
        </span>
      </div>
      <div className="update-banner-actions">
        <button
          type="button"
          className="update-banner-btn update-banner-btn-primary"
          onClick={() => { void s.installLatestUpdate(); }}
          disabled={s.updateInstalling}
        >
          {s.updateInstalling ? (
            <RefreshCw className="animate-spin" style={{ width: 14, height: 14 }} />
          ) : (
            <Download style={{ width: 14, height: 14 }} />
          )}
          {s.updateInstalling ? 'Preparing…' : `Update to v${info.latestVersion}`}
        </button>
        <button
          type="button"
          className="update-banner-btn"
          onClick={() => s.setActiveTab('settings')}
        >
          Details
        </button>
        <button
          type="button"
          className="update-banner-btn update-banner-btn-ghost"
          onClick={() => s.dismissUpdateBanner?.()}
          aria-label="Dismiss update banner until next check"
        >
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>
    </div>
  );
}
