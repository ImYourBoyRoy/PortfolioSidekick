// ./sidekick/src/app/components/SyncOverlay.jsx
/**
 * Tab-content sync/bootstrap progress overlay (does not cover header or tab nav).
 * Created by: Roy Dawson IV
 */
import { useEffect, useState } from 'react';
import { Brain } from 'lucide-react';
import { usePortfolio } from '../context/SidekickContext';
import { useI18n } from '../../i18n';

const CANCEL_AFTER_MS = 60_000;

const SYNC_STEP_KEYS = ['sync.step0', 'sync.step1', 'sync.step2', 'sync.step3', 'sync.step4'];

export default function SyncOverlay() {
  const {
    portfolioBootstrapping, syncing, syncStepIndex, cancelSync,
  } = usePortfolio();
  const { t } = useI18n();
  const [cancelReady, setCancelReady] = useState(false);

  const isBootstrap = portfolioBootstrapping && !syncing;

  useEffect(() => {
    const timer = setTimeout(() => setCancelReady(true), CANCEL_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  const title = isBootstrap ? t('sync.titleBootstrap') : t('sync.titleSync');
  const subtitle = isBootstrap ? t('sync.subtitleBootstrap') : t('sync.subtitleSync');
  const hint = isBootstrap ? t('sync.hintBootstrap') : t('sync.hintSync');

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
            {t(SYNC_STEP_KEYS[syncStepIndex] ?? SYNC_STEP_KEYS[0])}
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
            {t('sync.cancel')}
          </button>
        )}
      </div>
    </div>
  );
}
