// ./sidekick/src/app/components/UpdateBanner.jsx
/**
 * Persistent banner when a newer GitHub release is available.
 */
import { Download, RefreshCw, X } from 'lucide-react';
import { useSidekick } from '../context/SidekickContext';
import { useI18n } from '../../i18n';

export default function UpdateBanner() {
  const s = useSidekick();
  const { t } = useI18n();
  const info = s.updateInfo;

  if (!info?.updateAvailable || s.updateInstalling || !s.updateBannerVisible) return null;

  const platformLabel = info.platform
    ? t('update.platformBuild', { platform: info.platform })
    : t('update.yourPlatform');

  return (
    <div className="update-banner animate-fade-in" role="status" aria-live="polite">
      <div className="update-banner-copy">
        <strong>{t('update.bannerTitle', { version: info.latestVersion })}</strong>
        <span>
          {t('update.bannerBody', {
            current: info.currentVersion || s.APP_VERSION,
            platform: platformLabel,
          })}
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
          {s.updateInstalling
            ? t('update.preparing')
            : t('update.updateButton', { version: info.latestVersion })}
        </button>
        <button
          type="button"
          className="update-banner-btn"
          onClick={() => s.setActiveTab('settings')}
        >
          {t('update.details')}
        </button>
        <button
          type="button"
          className="update-banner-btn update-banner-btn-ghost"
          onClick={() => s.dismissUpdateBanner?.()}
          aria-label={t('update.dismissAria')}
        >
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>
    </div>
  );
}
