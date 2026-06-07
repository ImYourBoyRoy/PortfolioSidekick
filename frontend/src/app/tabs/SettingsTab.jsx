// ./frontend/src/app/tabs/SettingsTab.jsx
/**
 * Extracted from App.jsx — state via useSidekick().
 * Created by: Roy Dawson IV
 */
import { Info, Settings, Save, RotateCcw, ShieldCheck, Zap, Gauge, FileSearch, EyeOff, Eye } from 'lucide-react';
import { useSidekick } from '../context/SidekickContext';

export default function SettingsTab() {
  const s = useSidekick();

  return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="glass-card" style={{ padding: 20 }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Settings style={{ width: 18, height: 18, color: 'var(--color-oracle, #a78bfa)' }} />
              Indicator Engine & Risk Profiles
            </h3>
            <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              These values drive every calculation in the app — the chart&apos;s Bollinger Bands & moving averages, the Advisor scores,
              the Oracle viability forecasts, and stop-loss / target levels. Pick a risk profile to match your goals, or fine-tune any value.
              Changes apply instantly and are saved <strong>per profile</strong>
              {s.activeProfile ? <> — currently editing <strong style={{ color: '#c4b5fd' }}>{s.activeProfile.name}</strong>.</> : "."}
            </p>
          </div>

          {/* Risk Profile selector */}
          <div className="glass-card" style={{ padding: 18 }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '12px', fontWeight: 900, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Risk / Goal Profile
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {Object.entries(s.RISK_PROFILES).map(([key, preset]) => {
                const active = s.riskProfile === key;
                const icon = key === 'conservative' ? <ShieldCheck style={{ width: 16, height: 16 }} />
                  : key === 'aggressive' ? <Zap style={{ width: 16, height: 16 }} />
                  : <Gauge style={{ width: 16, height: 16 }} />;
                return (
                  <button
                    key={key}
                    onClick={() => s.applyRiskProfile(key)}
                    style={{
                      textAlign: 'left', cursor: 'pointer', borderRadius: 12, padding: '14px',
                      background: active ? 'rgba(139,92,246,0.10)' : 'rgba(255,255,255,0.02)',
                      border: active ? '1.5px solid var(--color-oracle, #a78bfa)' : '1px solid var(--border-light, rgba(255,255,255,0.07))',
                      display: 'flex', flexDirection: 'column', gap: 6, transition: 'all 0.15s'
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '13px', fontWeight: 900, color: active ? '#c4b5fd' : '#fff' }}>
                      {icon}{preset.label}
                    </span>
                    <span style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--color-oracle, #a78bfa)' }}>{preset.tagline}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{preset.description}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Active profile: <strong style={{ color: s.riskProfile === 'custom' ? '#fbbf24' : '#c4b5fd' }}>
                  {s.riskProfile === 'custom' ? 'Custom (hand-tuned)' : (s.RISK_PROFILES[s.riskProfile]?.label || 'Balanced')}
                </strong>
              </span>
              <button
                onClick={s.resetIndicatorDefaults}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '11px', fontWeight: 800, padding: '8px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-light, rgba(255,255,255,0.08))', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <RotateCcw style={{ width: 12, height: 12 }} /> Reset to Balanced defaults
              </button>
            </div>
          </div>

          {/* Editable indicator groups */}
          {Object.entries(
            Object.entries(s.INDICATOR_META).reduce((groups, [key, meta]) => {
              (groups[meta.group] = groups[meta.group] || []).push([key, meta]);
              return groups;
            }, {})
          ).map(([groupName, fields]) => (
            <div key={groupName} className="glass-card" style={{ padding: 18 }}>
              <h4 style={{ margin: '0 0 14px 0', fontSize: '12px', fontWeight: 900, color: 'var(--color-oracle, #a78bfa)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {groupName}
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                {fields.map(([key, meta]) => (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#fff' }}>{meta.label}</label>
                      <span style={{ fontSize: '11px', fontWeight: 900, color: '#c4b5fd', minWidth: 36, textAlign: 'right' }}>
                        {s.indicatorSettings[key]}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={meta.min}
                      max={meta.max}
                      step={meta.step}
                      value={s.indicatorSettings[key]}
                      onChange={(e) => s.updateIndicatorField(key, e.target.value)}
                      style={{ width: '100%', accentColor: 'var(--color-oracle, #a78bfa)' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="number"
                        min={meta.min}
                        max={meta.max}
                        step={meta.step}
                        value={s.indicatorSettings[key]}
                        onChange={(e) => s.updateIndicatorField(key, e.target.value)}
                        className="form-input-text"
                        style={{ width: 78, padding: '6px 8px', fontSize: '11px', textAlign: 'center' }}
                      />
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>range {meta.min}–{meta.max}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                      <Info style={{ width: 11, height: 11, flexShrink: 0, marginTop: 1 }} />
                      {meta.help}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="glass-card" style={{ padding: 18 }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: 900, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 8 }}>
              <EyeOff style={{ width: 14, height: 14 }} />
              Hidden Holdings
            </h4>
            <p style={{ margin: '0 0 12px 0', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Symbols hidden from the dashboard are excluded from equity totals and advisor scans. Warrants (e.g. ZYNE^) are auto-hidden after sync when the toggle below is on.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={s.autoHideWarrants}
                onChange={(e) => s.setAutoHideWarrants(e.target.checked)}
              />
              Auto-hide non-quotable warrants after Sync Account
            </label>
            {s.hiddenHoldings?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {s.hiddenHoldings.map((ticker) => (
                  <div key={ticker} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#fff' }}>{ticker}</span>
                    <button
                      type="button"
                      onClick={() => s.handleUnhideHolding(ticker)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '10px', fontWeight: 800, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(52,211,153,0.25)', color: '#6ee7b7' }}
                    >
                      <Eye style={{ width: 12, height: 12 }} /> Unhide
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: '10.5px', color: 'var(--text-muted)' }}>No hidden tickers for this profile.</p>
            )}
          </div>

          <div className="glass-card" style={{ padding: 18 }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: 900, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileSearch style={{ width: 14, height: 14 }} />
              Equity Diagnostic Dump
            </h4>
            <p style={{ margin: '0 0 12px 0', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              If Account Net Equity does not match Robinhood after Sync, run this to capture a sanitized API snapshot
              (no passwords/tokens) to <code style={{ color: '#c4b5fd' }}>data/equity_debug.json</code> beside the executable.
              Also check <code style={{ color: '#c4b5fd' }}>data/auth.log</code> for the latest account equity line.
            </p>
            <button
              type="button"
              disabled={!s.activeProfile || s.equityDiagnosticLoading}
              onClick={() => s.runEquityDiagnostic(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '11px', fontWeight: 800,
                padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(167,139,250,0.25)', color: '#ddd6fe',
              }}
            >
              {s.equityDiagnosticLoading ? 'Running diagnostic…' : 'Export equity_debug.json'}
            </button>
            {s.equityDiagnostic?.report?.reconciliation && (
              <div style={{ marginTop: 14, fontSize: '10.5px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <div><strong>UI equity source:</strong> {s.equityDiagnostic.report.sidekick_summary.equity_source}</div>
                <div><strong>Dashboard total:</strong> ${Number(s.equityDiagnostic.report.sidekick_summary.total_equity || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div><strong>RH net equity (picked):</strong> {s.equityDiagnostic.report.rh_equity_candidates?.picked_net_equity ?? '—'}</div>
                <div><strong>RH /portfolios/ equity:</strong> {s.equityDiagnostic.report.rh_equity_candidates?.portfolios_equity ?? '—'}</div>
                <div><strong>Tracked stocks + cash:</strong> ${Number(s.equityDiagnostic.report.sidekick_summary.computed_equity || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div><strong>Quote source:</strong> {s.equityDiagnostic.report.sidekick_summary.quote_source || '—'}</div>
                {s.equityDiagnostic.report.rh_batch_quote_probe && (
                  <div><strong>RH batch probe:</strong> {s.equityDiagnostic.report.rh_batch_quote_probe.resolved ?? '—'}/{s.equityDiagnostic.report.rh_batch_quote_probe.requested ?? '—'} symbols</div>
                )}
                {s.equityDiagnostic.report.reconciliation.likely_causes?.length > 0 && (
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                    {s.equityDiagnostic.report.reconciliation.likely_causes.map((cause) => (
                      <li key={cause}>{cause}</li>
                    ))}
                  </ul>
                )}
                {s.equityDiagnostic.saved_to && (
                  <div style={{ marginTop: 8, color: '#94a3b8' }}>Saved: {s.equityDiagnostic.saved_to}</div>
                )}
              </div>
            )}
          </div>

          <div className="glass-card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: '10.5px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <Save style={{ width: 14, height: 14, flexShrink: 0 }} />
            Settings save automatically to this device and apply to all analysis immediately. Re-open a stock on the Coach chart to see updated bands and signals.
          </div>
        </div>
  );
}
