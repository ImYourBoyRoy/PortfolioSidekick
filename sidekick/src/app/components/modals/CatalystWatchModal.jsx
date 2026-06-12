// ./sidekick/src/app/components/modals/CatalystWatchModal.jsx
/**
 * Add or edit a forward-looking catalyst watch on a holding.
 */
import { X, Calendar, Link2, Sparkles } from 'lucide-react';
import { useShell, useOracle } from '../../context/SidekickContext';

const BIAS_OPTIONS = [
  { id: 'bullish', label: 'Bullish — prep to add / hold through' },
  { id: 'watch', label: 'Uncertain — could break either way' },
  { id: 'bearish', label: 'Bearish — prep to reduce' },
];

export default function CatalystWatchModal() {
  const { catalystModalOpen, loading } = useShell();
  const o = useOracle();
  if (!catalystModalOpen) return null;

  const form = o.catalystForm;

  return (
    <div className="modal-overlay" onClick={() => o.closeCatalystModal()}>
      <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div>
            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles style={{ width: 16, height: 16, color: '#fbbf24' }} />
              Catalyst Watch — {form.ticker}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '10px', color: 'var(--text-muted)' }}>
              Forward event overlay. Softens Abort signals when enabled — technicals stay visible.
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={() => o.closeCatalystModal()} aria-label="Close">
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <form
          onSubmit={o.handleSaveCatalystWatch}
          style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
            Event title
            <input
              type="text"
              value={form.title}
              onChange={(e) => o.setCatalystForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. SpaceX IPO — innovation ETF sentiment lift"
              required
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-light)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '12px' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar style={{ width: 12, height: 12 }} /> Event date (optional)
            </span>
            <input
              type="date"
              value={form.event_date || ''}
              onChange={(e) => o.setCatalystForm((f) => ({ ...f, event_date: e.target.value || null }))}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-light)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '12px' }}
            />
          </label>

          <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
            <legend style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>Bias</legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {BIAS_OPTIONS.map((opt) => (
                <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="catalyst-bias"
                    checked={form.bias === opt.id}
                    onChange={() => o.setCatalystForm((f) => ({ ...f, bias: opt.id }))}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Link2 style={{ width: 12, height: 12 }} /> Associated tickers (comma-separated)
            </span>
            <input
              type="text"
              value={form.associated_tickers}
              onChange={(e) => o.setCatalystForm((f) => ({ ...f, associated_tickers: e.target.value }))}
              placeholder="SPCX, TSLA, QQQ"
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-light)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '12px' }}
            />
            <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '10px' }}>
              Pulled into News refresh for headline context around the catalyst.
            </span>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
            Notes
            <textarea
              value={form.notes}
              onChange={(e) => o.setCatalystForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="Thesis, sizing plan, what would invalidate the trade…"
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-light)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '12px', resize: 'vertical' }}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.soften_abort}
              onChange={(e) => o.setCatalystForm((f) => ({ ...f, soften_abort: e.target.checked }))}
            />
            Soften Abort zone while catalyst is active (show as Catalyst Hold)
          </label>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="submit" className="btn-base btn-primary" disabled={loading}>
              Save Catalyst Watch
            </button>
            {form.id && (
              <button
                type="button"
                className="btn-base btn-secondary btn-danger"
                onClick={() => o.handleDeleteCatalystWatch(form.id)}
              >
                Remove
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
