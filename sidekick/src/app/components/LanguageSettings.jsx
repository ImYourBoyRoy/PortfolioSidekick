// ./sidekick/src/app/components/LanguageSettings.jsx
/**
 * Language picker in Settings — device default with manual override.
 */
import { Globe } from 'lucide-react';
import { useI18n, SYSTEM_LOCALE_PREFERENCE, getLocaleMeta } from '../../i18n';

export default function LanguageSettings() {
  const {
    locale, preference, deviceLocale, t, setLocalePreference, supportedLocales,
  } = useI18n();

  const deviceMeta = getLocaleMeta(deviceLocale);
  const activeMeta = getLocaleMeta(locale);
  const selectValue = preference === SYSTEM_LOCALE_PREFERENCE ? SYSTEM_LOCALE_PREFERENCE : preference;

  return (
    <div className="glass-card" style={{ padding: 20 }}>
      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Globe style={{ width: 18, height: 18, color: '#60a5fa' }} />
        {t('settings.languageTitle')}
      </h3>
      <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
        {t('settings.languageHint')}
      </p>
      <p style={{ margin: '10px 0 0 0', fontSize: '10.5px', color: 'var(--text-secondary)' }}>
        {t('settings.languageCurrent', { language: activeMeta.nativeName })}
      </p>

      <label
        htmlFor="sidekick-language-select"
        style={{ display: 'block', marginTop: 16, fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}
      >
        {t('settings.languageSelectLabel')}
      </label>
      <select
        id="sidekick-language-select"
        value={selectValue}
        onChange={(e) => setLocalePreference(e.target.value)}
        className="form-input-text"
        style={{
          marginTop: 8,
          width: '100%',
          maxWidth: 420,
          fontSize: '13px',
          padding: '12px 14px',
          borderRadius: 12,
          cursor: 'pointer',
        }}
      >
        <option value={SYSTEM_LOCALE_PREFERENCE}>
          {t('settings.languageSystem', { language: deviceMeta.nativeName })}
        </option>
        {supportedLocales.map((item) => (
          <option key={item.code} value={item.code}>
            {item.nativeName} ({item.code})
          </option>
        ))}
      </select>
    </div>
  );
}
