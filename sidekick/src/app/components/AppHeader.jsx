// ./sidekick/src/app/components/AppHeader.jsx
/**
 * Compact top bar — brand + menu toggle (actions live in sidebar).
 */
import { APP_VERSION } from '../../lib/appVersion';
import { Menu } from 'lucide-react';
import { useSidekick } from '../context/SidekickContext';

export default function AppHeader({ onMenuOpen }) {
  const s = useSidekick();
  const isLinked = s.hasCachedRobinhoodSession || Boolean(s.activeProfile?.robinhood_username);

  return (
    <header className="navbar-header">
      <div className="brand-wrapper">
        <img src="./app-icon.png" alt="" className="brand-app-icon" width={44} height={44} />
        <div>
          <h1 className="brand-title">
            Portfolio Sidekick{' '}
            <button
              type="button"
              className="brand-version-badge"
              onClick={() => {
                s.setActiveTab('settings');
                if (!s.updateInfo?.updateAvailable) void s.checkForUpdates(true);
              }}
              title={s.updateInfo?.updateAvailable ? `Update v${s.updateInfo.latestVersion} available` : 'App version'}
            >
              {s.updateInfo?.updateAvailable ? `UPDATE v${s.updateInfo.latestVersion}` : `v${APP_VERSION}`}
            </button>
          </h1>
          <p className="brand-desc">
            {isLinked ? 'Live Robinhood · Local & Private' : 'Local Privacy-Preserved Companion'}
          </p>
        </div>
      </div>

      <button
        type="button"
        className="btn-base btn-secondary app-menu-btn"
        onClick={onMenuOpen}
        aria-label="Open account menu"
      >
        <Menu style={{ width: 18, height: 18 }} />
        <span className="app-menu-btn-label">Menu</span>
      </button>
    </header>
  );
}
