// ./frontend/src/app/components/modals/ImportModal.jsx
/**
 * Extracted from App.jsx — state via useSidekick().
 * Created by: Roy Dawson IV
 */
import { RefreshCw, X, Clipboard } from 'lucide-react';
import { useSidekick } from '../../context/SidekickContext';

export default function ImportModal() {
  const s = useSidekick();

  if (!s.isImportOpen) return null;

  return (
        <div className="modal-overlay">
          <div className="glass-card modal-card">
            <button 
              onClick={() => s.setIsImportOpen(false)}
              className="modal-close-btn"
            >
              <X style={{ width: 18, height: 18 }} />
            </button>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
              <div className="modal-icon-container" style={{ backgroundColor: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                <Clipboard className="w-5 h-5 text-violet-400" />
              </div>
              <h3 className="modal-title">Paste Copied Portfolio</h3>
              <p className="modal-subtitle">
                Copy your holdings list straight from the Robinhood web client screen, then paste it below. 
                Our regex algorithm extracts shares and average cost bases in a split second!
              </p>
            </div>

            <form onSubmit={s.handleImportClipboard} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <textarea
                  required
                  rows="6"
                  placeholder={`Example list block to copy/paste:\nNVDA\n41.35 shares\n$212.49\n+4.25%`}
                  value={s.clipboardText}
                  onChange={(e) => s.setClipboardText(e.target.value)}
                  className="form-input-text"
                  style={{ height: '140px', fontFamily: 'monospace', fontSize: '11px' }}
                />
              </div>

              <button
                type="submit"
                disabled={s.loading}
                className="btn-evolve"
                style={{ width: '100%', padding: '12px', justifyContent: 'center' }}
              >
                {s.loading && <RefreshCw className="animate-spin" style={{ width: 14, height: 14 }} />}
                Import Holdings to Local DB
              </button>
            </form>
          </div>
        </div>
  );
}
