// ./sidekick/src/app/components/AppHeader.jsx
/**
 * Compact top bar — brand + menu toggle (actions live in sidebar).
 */
import { APP_VERSION } from '../../lib/appVersion';
import { Menu } from 'lucide-react';
import { useSidekick } from '../context/SidekickContext';
import { useI18n } from '../../i18n';

export default function AppHeader({ onMenuOpen }) {
  const s = useSidekick();
  const { t } = useI18n();
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
              title={s.updateInfo?.updateAvailable
                ? t('header.updateAvailable', { version: s.updateInfo.latestVersion })
                : t('header.version')}
            >
              {s.updateInfo?.updateAvailable ? `UPDATE v${s.updateInfo.latestVersion}` : `v${APP_VERSION}`}
            </button>
          </h1>
          <p className="brand-desc">
            {isLinked ? t('header.taglineLinked') : t('header.taglineLocal')}
          </p>
        </div>
      </div>

      <button
        type="button"
        className="btn-base btn-secondary app-menu-btn"
        onClick={onMenuOpen}
        aria-label={t('header.menu')}
      >
        <Menu style={{ width: 18, height: 18 }} />
        <span className="app-menu-btn-label">{t('header.menu')}</span>
      </button>
    </header>
  );
}
