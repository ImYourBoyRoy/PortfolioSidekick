// ./sidekick/src/app/components/ToastStack.jsx
/**
 * Extracted from App.jsx — state via useSidekick().
 * Created by: Roy Dawson IV
 */
import { X, CheckCircle, Info, AlertOctagon, AlertTriangle } from 'lucide-react';
import { useSidekick } from '../context/SidekickContext';

export default function ToastStack() {
  const s = useSidekick();

  return (
      <div className="toast-container">
        {s.toasts.map(t => (
          <div key={t.id} className={`toast-card toast-${t.type}`} onClick={() => s.dismissToast(t.id)}>
            <div className="toast-icon-box">
              {t.type === 'success' && <CheckCircle style={{ width: 15, height: 15, color: '#34d399' }} />}
              {t.type === 'error' && <AlertOctagon style={{ width: 15, height: 15, color: '#fb7185' }} />}
              {t.type === 'warning' && <AlertTriangle style={{ width: 15, height: 15, color: '#fbbf24' }} />}
              {t.type === 'info' && <Info style={{ width: 15, height: 15, color: '#a78bfa' }} />}
            </div>
            <div className="toast-body">
              {t.message}
            </div>
            <button className="toast-close" onClick={(e) => { e.stopPropagation(); s.dismissToast(t.id); }}>
              <X style={{ width: 12, height: 12 }} />
            </button>
            <div className="toast-progress-bar" style={{ animationDuration: `${t.duration}ms` }} />
          </div>
        ))}
      </div>
  );
}
