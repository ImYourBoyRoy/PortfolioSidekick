// ./sidekick/src/app/components/WelcomeScreen.jsx
/**
 * Extracted from App.jsx — state via useSidekick().
 * Created by: Roy Dawson IV
 */
import { Plus, Brain } from 'lucide-react';
import { useProfiles } from '../context/SidekickContext';
import { useI18n } from '../../i18n';

export default function WelcomeScreen() {
  const s = useProfiles();
  const { t } = useI18n();

  return (
      <div className="app-container" style={{ display: 'flex', minHeight: '85vh', alignItems: 'center', justifyContent: 'center' }}>
        <div className="glass-card animate-fade-in" style={{ padding: '40px', maxWidth: '480px', width: '100%', textAlign: 'center', border: '1px solid var(--border-glow)' }}>
          <div className="brand-icon-box" style={{ width: '60px', height: '60px', borderRadius: '18px', margin: '0 auto 24px', animation: 'pulse-glow 2.5s infinite' }}>
            <Brain className="w-7 h-7 text-white" />
          </div>
          
          <h2 style={{ fontSize: '1.75rem', fontWeight: '950', color: '#fff', marginBottom: '8px' }}>{t('welcome.title')}</h2>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '32px' }}>
            {t('welcome.subtitle')}
          </p>

          <form onSubmit={(e) => {
            e.preventDefault();
            if (s.newProfileName.trim()) {
              s.handleCreateProfile(s.newProfileName.trim(), false);
            }
          }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="input-group" style={{ textAlign: 'left' }}>
              <label className="input-label" style={{ textAlign: 'center', display: 'block', marginBottom: '8px' }}>{t('welcome.profileLabel')}</label>
              <input
                type="text"
                required
                placeholder={t('welcome.profilePlaceholder')}
                value={s.newProfileName}
                onChange={(e) => s.setNewProfileName(e.target.value)}
                className="form-input-text"
                style={{ textAlign: 'center', fontSize: '14px', padding: '12px 16px', borderRadius: '12px' }}
              />
            </div>

            <button type="submit" className="btn-base btn-primary" style={{ padding: '14px', width: '100%', justifyContent: 'center', fontSize: '12px', borderRadius: '12px' }}>
              <Plus className="w-4 h-4" />
              {t('welcome.createButton')}
            </button>


          </form>
        </div>
      </div>
  );
}
