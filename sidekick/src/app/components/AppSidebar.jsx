// ./sidekick/src/app/components/AppSidebar.jsx
/**
 * Primary actions sidebar — profiles, sync, import, logout.
 */
import { User, ShieldAlert, RefreshCw, Plus, X, Clipboard, PanelLeftClose } from 'lucide-react';
import { useSidekick } from '../context/SidekickContext';

export default function AppSidebar({ open, onClose }) {
  const s = useSidekick();
  const busy = s.syncing || s.loading;
  const isLinked = s.hasCachedRobinhoodSession || Boolean(s.activeProfile?.robinhood_username);

  return (
    <>
      <div
        className={`app-sidebar-backdrop ${open ? 'is-open' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside className={`app-sidebar ${open ? 'is-open' : ''}`} aria-label="App menu">
        <div className="app-sidebar-head">
          <span className="app-sidebar-title">Account &amp; Tools</span>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close menu">
            <PanelLeftClose style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div className="profile-selector-box app-sidebar-profiles">
          {s.profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                if (!busy) {
                  s.setActiveProfile(p);
                  s.setSelectedTicker('NVDA');
                  onClose?.();
                }
              }}
              disabled={busy}
              className={`profile-btn ${s.activeProfile?.id === p.id ? 'profile-btn-active' : ''}`}
            >
              <User style={{ width: 12, height: 12 }} />
              {p.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { if (!busy) s.setIsProfileModalOpen(true); }}
            disabled={busy}
            className="profile-btn profile-btn-add"
            title="Add profile"
          >
            <Plus style={{ width: 14, height: 14 }} />
          </button>
        </div>

        <div className="app-sidebar-actions">
          <button
            type="button"
            onClick={() => { if (s.activeProfile) s.triggerSync(); }}
            className="btn-base btn-primary btn-block"
            disabled={busy}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${s.syncing ? 'animate-spin' : ''}`} />
            {s.syncing ? 'Syncing…' : 'Sync Account'}
          </button>

          {s.debugMode && (
            <button
              type="button"
              onClick={() => { if (!busy) s.setIsImportOpen(true); }}
              disabled={busy}
              className="btn-base btn-secondary btn-block"
            >
              <Clipboard style={{ width: 14, height: 14, color: 'var(--color-oracle)' }} />
              Paste Holdings
            </button>
          )}

          {s.activeProfile && (
            <button
              type="button"
              onClick={() => s.handleDeleteProfile(s.activeProfile.id)}
              disabled={busy}
              className="btn-base btn-secondary btn-block btn-danger"
            >
              <X style={{ width: 14, height: 14 }} />
              Delete Profile
            </button>
          )}

          {isLinked && (
            <button
              type="button"
              onClick={s.handleLogout}
              disabled={busy}
              className="btn-base btn-secondary btn-block btn-danger"
            >
              <ShieldAlert style={{ width: 14, height: 14 }} />
              Log Out Robinhood
            </button>
          )}
        </div>

        {isLinked && (
          <p className="app-sidebar-status live">
            Robinhood session active on this device.
          </p>
        )}
      </aside>
    </>
  );
}
