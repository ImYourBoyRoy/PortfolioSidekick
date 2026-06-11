// ./sidekick/src/app/components/InvestorBriefPanel.jsx
/**
 * Macro investor brief — this week's events, themes, and portfolio-specific alerts.
 */
import { Calendar, AlertTriangle, Sparkles, TrendingUp, Radio } from 'lucide-react';
import { useSidekick } from '../context/SidekickContext';

const CATEGORY_COLORS = {
  ipo: '#a78bfa',
  fed: '#fbbf24',
  inflation: '#fb7185',
  options: '#94a3b8',
  sector: '#34d399',
  earnings: '#60a5fa',
  geopolitical: '#f87171',
};

export default function InvestorBriefPanel({ compact = false }) {
  const s = useSidekick();
  const brief = s.investorBrief;
  if (!brief?.events?.length) return null;

  return (
    <div
      className="glass-card"
      style={{
        padding: compact ? 14 : 18,
        border: '1px solid rgba(167, 139, 250, 0.2)',
        background: 'linear-gradient(135deg, rgba(139,92,246,0.06) 0%, rgba(15,23,42,0.4) 100%)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: compact ? '13px' : '15px', fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Radio style={{ width: 16, height: 16, color: '#a78bfa' }} />
            Investor Brief
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '10px', color: 'var(--text-muted)' }}>
            Forward macro calendar · as of {brief.as_of} — prep beyond today&apos;s technicals
          </p>
        </div>
        {!compact && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 420 }}>
            {brief.themes.map((t) => (
              <span
                key={t.id}
                title={t.detail}
                style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  padding: '4px 8px',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--text-secondary)',
                }}
              >
                {t.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {brief.events.slice(0, compact ? 3 : 5).map((ev) => {
          const color = CATEGORY_COLORS[ev.category] || '#a78bfa';
          const countdown = ev.days_until == null
            ? 'Ongoing theme'
            : ev.days_until > 1
              ? `${ev.days_until}d`
              : ev.days_until === 1
                ? 'Tomorrow'
                : ev.days_until === 0
                  ? 'Today'
                  : `${Math.abs(ev.days_until)}d ago`;
          return (
            <div
              key={ev.id}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                background: 'rgba(0,0,0,0.2)',
                border: `1px solid ${color}33`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '11px', color: '#fff' }}>{ev.title}</strong>
                <span style={{ fontSize: '9px', fontWeight: 800, color, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Calendar style={{ width: 10, height: 10 }} />
                  {countdown}
                </span>
              </div>
              {!compact && (
                <p style={{ margin: '6px 0 0', fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {ev.summary}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {s.portfolioMacroAlerts?.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '10px', fontWeight: 900, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle style={{ width: 12, height: 12 }} />
            Your holdings in the crosshairs
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {s.portfolioMacroAlerts.slice(0, compact ? 4 : 8).map((a) => (
              <div key={a.ticker} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: '10px' }}>
                <span style={{ fontWeight: 800, color: '#fff' }}>{a.ticker}</span>
                <span style={{ color: 'var(--text-muted)', flex: 1, minWidth: 120 }}>
                  {a.nearest_event.title}
                  {a.tension === 'technical_weak_macro_catalyst' && (
                    <span style={{ color: '#fbbf24', marginLeft: 6 }}>· tech weak + macro ahead</span>
                  )}
                </span>
                <button
                  type="button"
                  className="zone-action-btn"
                  style={{ fontSize: '9px', padding: '4px 8px', color: '#c4b5fd' }}
                  onClick={() => {
                    const sug = s.suggestCatalystFromMacro(a.ticker);
                    s.openCatalystModal(a.ticker, sug);
                  }}
                >
                  <Sparkles style={{ width: 10, height: 10 }} />
                  Catalyst
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!compact && s.holdings.length > 0 && (
        <p style={{ margin: '12px 0 0', fontSize: '9.5px', color: 'var(--text-muted)', lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <TrendingUp style={{ width: 12, height: 12, flexShrink: 0, marginTop: 1, color: '#34d399' }} />
          Sidekick blends live technical conviction with this macro calendar in Strategy → Forward Prep. Add a Catalyst Watch to override Abort when you disagree with the tape.
        </p>
      )}
    </div>
  );
}
