// ./sidekick/src/app/tabs/NewsTab.jsx
/**
 * Market headlines — major indices, holdings, watchlist, and top movers.
 */
import { useState } from 'react';
import { Calendar, RefreshCw, History, Newspaper, ExternalLink, Zap, ChevronDown, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import { useSidekick } from '../context/SidekickContext';
import InvestorBriefPanel from '../components/InvestorBriefPanel';

const NEWS_SECTIONS = [
  { key: 'today', label: 'Today', icon: Zap },
  { key: 'week', label: 'This Week', icon: Calendar },
  { key: 'month', label: 'This Month', icon: Calendar },
  { key: 'year', label: 'Earlier This Year', icon: History },
];

export default function NewsTab() {
  const s = useSidekick();
  const [expanded, setExpanded] = useState({ today: true, week: false, month: false, year: false });

  const toggleSection = (key) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const moverDeck = s.calculateMarketStrength('day', 'all');
  const movers = [
    ...(moverDeck.top_gainers || []),
    ...(moverDeck.worst_decliners || []),
  ];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <InvestorBriefPanel compact />

      <div className="glass-card" style={{ padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Newspaper style={{ width: 18, height: 18, color: 'var(--color-oracle, #a78bfa)' }} />
            Major Market Events
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
            Headlines across major indices{(s.holdings.length > 0 || s.watchlist.length > 0) ? ', your holdings & watchlist' : ''}, and top 15 market movers.
            {s.newsData?.fetchedAt ? ` Updated ${s.formatRelativeTime(s.newsData.fetchedAt)}.` : ''}
          </p>
        </div>
        <button
          onClick={() => s.loadMarketNews()}
          disabled={s.newsLoading}
          className="btn-primary"
          style={{ padding: '10px 16px', fontSize: '11px', fontWeight: 800, borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: s.newsLoading ? 0.6 : 1 }}
        >
          <RefreshCw className={s.newsLoading ? 'animate-spin' : ''} style={{ width: 13, height: 13 }} />
          {s.newsLoading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {movers.length > 0 && (
        <div className="glass-card" style={{ padding: 16 }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', fontWeight: 900, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Top 15 Movers in News Feed
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {movers.map((m) => {
              const up = (m.change_pct ?? 0) >= 0;
              const Icon = up ? TrendingUp : TrendingDown;
              return (
                <span
                  key={m.ticker}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: '10px',
                    fontWeight: 800,
                    padding: '4px 8px',
                    borderRadius: 8,
                    background: up ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
                    color: up ? '#6ee7b7' : '#fda4af',
                    border: `1px solid ${up ? 'rgba(52,211,153,0.2)' : 'rgba(251,113,133,0.2)'}`,
                  }}
                >
                  <Icon style={{ width: 10, height: 10 }} />
                  {m.ticker} {m.change_pct > 0 ? '+' : ''}{m.change_pct}%
                </span>
              );
            })}
          </div>
        </div>
      )}

      {s.newsLoading && !s.newsData && (
        <div className="glass-card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
          <RefreshCw className="animate-spin" style={{ width: 22, height: 22, marginBottom: 10 }} />
          <div>Gathering the latest major market headlines…</div>
        </div>
      )}

      {s.newsData?.error && (
        <div className="glass-card" style={{ padding: 28, textAlign: 'center', color: '#fbbf24', fontSize: '12px', border: '1px solid rgba(245,158,11,0.2)' }}>
          {s.newsData.error}
        </div>
      )}

      {s.newsData && !s.newsData.error && NEWS_SECTIONS.map((section) => {
        const items = s.newsData.buckets[section.key] || [];
        if (items.length === 0) return null;
        const isOpen = expanded[section.key];
        const SectionIcon = section.icon;
        return (
          <div key={section.key} className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => toggleSection(section.key)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'inherit',
              }}
            >
              <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 900, color: 'var(--color-oracle, #a78bfa)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <SectionIcon style={{ width: 14, height: 14 }} />
                {section.label}
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>· {items.length}</span>
              </h4>
              {isOpen ? <ChevronDown style={{ width: 16, height: 16, color: 'var(--text-muted)' }} /> : <ChevronRight style={{ width: 16, height: 16, color: 'var(--text-muted)' }} />}
            </button>
            {isOpen && (
              <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => s.openNewsLink(item.link)}
                    style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light, rgba(255,255,255,0.06))', borderRadius: 10, padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, transition: 'background 0.15s' }}
                  >
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#fff', lineHeight: 1.45, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      {item.title}
                      <ExternalLink style={{ width: 12, height: 12, color: 'var(--text-muted)', flexShrink: 0, marginTop: 2 }} />
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ color: 'var(--text-secondary)' }}>{item.publisher}</strong>
                      · {s.formatRelativeTime(item.timestamp)}
                      {item.relatedTickers.map((t) => (
                        <span key={t} style={{ background: 'rgba(139,92,246,0.12)', color: '#c4b5fd', padding: '1px 6px', borderRadius: 6, fontWeight: 700 }}>{t}</span>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {s.newsData && !s.newsData.error && s.newsData.total === 0 && (
        <div className="glass-card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
          No headlines available right now. Try refreshing in a moment.
        </div>
      )}
    </div>
  );
}
