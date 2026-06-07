// ./frontend/src/app/components/AppHeader.jsx
/**
 * Extracted from App.jsx — state via useSidekick().
 * Created by: Roy Dawson IV
 */
import { APP_VERSION } from '../../appVersion';
import { User, ShieldAlert, RefreshCw, Plus, X, Clipboard, Brain } from 'lucide-react';
import { useSidekick } from '../context/SidekickContext';

export default function AppHeader() {
  const s = useSidekick();

  return (
      <header className="navbar-header">
        <div className="brand-wrapper">
          <div className="brand-icon-box">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="brand-title">
              Portfolio Sidekick <span className="brand-version-badge">COACH ACTIVE v{APP_VERSION}</span>
            </h1>
            <p className="brand-desc">Local Privacy-Preserved Companion for Robinhood</p>
          </div>
        </div>

        {/* Profile Switcher & Dynamic Actions */}
        <div className="header-controls">
          <div className="profile-selector-box">
            {s.profiles.map(p => (
              <button
                key={p.id}
                onClick={() => {
                  if (!s.syncing && !s.loading) {
                    s.setActiveProfile(p);
                    s.setSelectedTicker("NVDA");
                  }
                }}
                disabled={s.syncing || s.loading}
                style={{ opacity: (s.syncing || s.loading) ? 0.65 : 1, cursor: (s.syncing || s.loading) ? 'not-allowed' : 'pointer' }}
                className={`profile-btn ${s.activeProfile?.id === p.id ? 'profile-btn-active' : ''}`}
              >
                <User className="w-3 h-3" />
                {p.name}
              </button>
            ))}
            <button
              onClick={() => {
                if (!s.syncing && !s.loading) {
                  s.setIsProfileModalOpen(true);
                }
              }}
              disabled={s.syncing || s.loading}
              className="profile-btn"
              style={{ 
                color: 'var(--color-buy)', 
                borderLeft: '1px solid var(--border-light)', 
                marginLeft: '4px', 
                paddingLeft: '8px', 
                paddingRight: '8px',
                opacity: (s.syncing || s.loading) ? 0.65 : 1,
                cursor: (s.syncing || s.loading) ? 'not-allowed' : 'pointer'
              }}
              title="Add New Profile"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {s.activeProfile && (
            <button
              onClick={() => s.handleDeleteProfile(s.activeProfile.id)}
              className="btn-base btn-secondary"
              style={{ 
                padding: '8px 12px', 
                borderColor: 'rgba(244, 63, 94, 0.15)', 
                color: '#fb7185',
                opacity: (s.syncing || s.loading) ? 0.65 : 1,
                cursor: (s.syncing || s.loading) ? 'not-allowed' : 'pointer'
              }}
              title="Delete Active Profile"
              disabled={s.syncing || s.loading}
            >
              <X className="w-3.5 h-3.5" />
              Delete Profile
            </button>
          )}

          <div style={{ width: 1, height: 24, backgroundColor: 'var(--border-light)', margin: '0 4px' }}></div>

          <button
            onClick={() => {
              if (!s.syncing && !s.loading) {
                s.setIsImportOpen(true);
              }
            }}
            disabled={s.syncing || s.loading}
            className="btn-base btn-secondary"
            style={{ 
              opacity: (s.syncing || s.loading) ? 0.65 : 1,
              cursor: (s.syncing || s.loading) ? 'not-allowed' : 'pointer'
            }}
          >
            <Clipboard className="w-3.5 h-3.5" style={{ color: 'var(--color-oracle)' }} />
            Paste List
          </button>

          {s.activeProfile && s.activeProfile.robinhood_username && (
            <button
              onClick={s.handleLogout}
              className="btn-base btn-secondary"
              style={{ 
                borderColor: 'rgba(244, 63, 94, 0.25)', 
                color: '#fb7185',
                opacity: (s.syncing || s.loading) ? 0.65 : 1,
                cursor: (s.syncing || s.loading) ? 'not-allowed' : 'pointer'
              }}
              title="Securely Log Out and Wipe Session from Disk"
              disabled={s.syncing || s.loading}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Log Out
            </button>
          )}

          <button
            onClick={() => {
              if (s.activeProfile) s.triggerSync();
            }}
            className="btn-base btn-primary"
            disabled={s.syncing || s.loading}
            style={{ 
              opacity: (s.syncing || s.loading) ? 0.65 : 1, 
              cursor: (s.syncing || s.loading) ? 'not-allowed' : 'pointer' 
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${s.syncing ? 'animate-spin' : ''}`} />
            {s.syncing ? "Syncing..." : "Sync Account"}
          </button>
        </div>
      </header>
  );
}
