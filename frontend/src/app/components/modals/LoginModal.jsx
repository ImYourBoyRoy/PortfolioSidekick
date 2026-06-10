// ./frontend/src/app/components/modals/LoginModal.jsx
/**
 * Extracted from App.jsx — state via useSidekick().
 * Created by: Roy Dawson IV
 */
import { createPortal } from 'react-dom';
import { ShieldAlert, RefreshCw, X, Sliders } from 'lucide-react';
import { useSidekick } from '../../context/SidekickContext';

export default function LoginModal() {
  const s = useSidekick();

  if (!s.isLoginOpen) return null;

  return createPortal(
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Robinhood login">
          <div className="glass-card modal-card">
            <button 
              onClick={() => {
                if (!s.loading) s.setIsLoginOpen(false);
              }}
              disabled={s.loading}
              className="modal-close-btn"
              style={{ cursor: s.loading ? 'not-allowed' : 'pointer', opacity: s.loading ? 0.5 : 1 }}
            >
              <X style={{ width: 18, height: 18 }} />
            </button>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
              <div className="modal-icon-container" style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                <Sliders className="w-5 h-5" style={{ color: 'var(--color-buy)' }} />
              </div>
              <h3 className="modal-title">Robinhood Local Sync</h3>
              <p className="modal-subtitle" style={{ color: 'var(--color-buy)', fontWeight: '700', marginBottom: '8px' }}>
                🔒 100% Optional &amp; Local Isolation
              </p>
              <p className="modal-subtitle" style={{ fontSize: '10.5px', lineHeight: '1.5', margin: '0 8px' }}>
                Connecting your account is entirely optional! All planning, predicting, and rebalancing tools work offline. If you sync, Robinhood OAuth tokens are stored in an encrypted on-device vault — passwords are never persisted.
              </p>
              {s.desktopAuthProbe && s.desktopAuthProbe.platform !== 'dev' && (
                <p
                  className="modal-subtitle"
                  style={{
                    fontSize: '10px',
                    lineHeight: '1.45',
                    margin: '10px 8px 0',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: s.authShellIsReady(s.desktopAuthProbe)
                      ? '1px solid rgba(16, 185, 129, 0.35)'
                      : '1px solid rgba(251, 191, 36, 0.45)',
                    color: s.authShellIsReady(s.desktopAuthProbe)
                      ? 'var(--color-buy)'
                      : '#fbbf24',
                    background: s.authShellIsReady(s.desktopAuthProbe)
                      ? 'rgba(16, 185, 129, 0.08)'
                      : 'rgba(251, 191, 36, 0.08)',
                  }}
                >
                  {s.desktopAuthReadyMessage(s.desktopAuthProbe)}
                </p>
              )}
            </div>

            <form onSubmit={s.handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <label className="input-label">Robinhood Username</label>
                <input
                  type="email"
                  required
                  disabled={s.loading}
                  placeholder="e.g. name@gmail.com"
                  value={s.loginForm.username}
                  onChange={(e) => s.setLoginForm(prev => ({ ...prev, username: e.target.value }))}
                  className="form-input-text"
                  style={{ opacity: s.loading ? 0.6 : 1, cursor: s.loading ? 'not-allowed' : 'default' }}
                />
              </div>

              <div className="input-group">
                <label className="input-label">Robinhood Password</label>
                <input
                  type="password"
                  required
                  disabled={s.loading}
                  placeholder="••••••••••••"
                  value={s.loginForm.password}
                  onChange={(e) => s.setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                  className="form-input-text"
                  style={{ opacity: s.loading ? 0.6 : 1, cursor: s.loading ? 'not-allowed' : 'default' }}
                />
              </div>

              {s.loginStatus.status === "mfa_required" && (
                <div className="input-group" style={{ borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
                  <label className="input-label animate-pulse" style={{ color: 'var(--color-buy)', fontWeight: '900', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ShieldAlert style={{ width: 14, height: 14 }} />
                    {s.loginStatus.challenge_type === "prompt"
                      ? "Robinhood App Push Approval Required"
                      : s.loginStatus.challenge_type === "email"
                        ? "Enter Email Verification Code"
                        : "Enter SMS Verification Code"}
                  </label>
                  {s.loginStatus.challenge_type === "prompt" ? (
                    <>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', margin: '8px 0', lineHeight: 1.6 }}>
                        Open your <strong style={{ color: 'var(--color-buy)' }}>Robinhood mobile app</strong> and approve the login notification.
                        We&apos;ll detect it automatically.
                        <br />
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, color: '#fbbf24' }}>
                          <RefreshCw className="animate-spin" style={{ width: 12, height: 12 }} />
                          {s.loginStatus.message?.includes('processing') || s.loginStatus.message?.includes('finishing')
                            ? 'Finishing login…'
                            : (s.loginStatus.message || 'Waiting for approval…')}
                        </span>
                      </p>
                      <input
                        type="text"
                        disabled={s.loading}
                        placeholder="SMS code (if Robinhood sent one)"
                        value={s.loginForm.mfa_code}
                        onChange={(e) => s.setLoginForm(prev => ({ ...prev, mfa_code: e.target.value }))}
                        className="form-input-text"
                        style={{ letterSpacing: '0.25em', textAlign: 'center', fontWeight: '800', marginTop: 8, opacity: s.loading ? 0.6 : 1, cursor: s.loading ? 'not-allowed' : 'default' }}
                      />
                    </>
                  ) : s.loginStatus.challenge_issued ? (
                    <input
                      type="text"
                      required
                      disabled={s.loading}
                      placeholder="e.g. 123456"
                      value={s.loginForm.mfa_code}
                      onChange={(e) => s.setLoginForm(prev => ({ ...prev, mfa_code: e.target.value }))}
                      className="form-input-text"
                      autoFocus
                      style={{ letterSpacing: '0.25em', textAlign: 'center', fontWeight: '800', opacity: s.loading ? 0.6 : 1, cursor: s.loading ? 'not-allowed' : 'default' }}
                    />
                  ) : (
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', margin: '8px 0', lineHeight: 1.6 }}>
                      Robinhood is sending your {s.loginStatus.challenge_type} code…
                      <br />
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, color: '#fbbf24' }}>
                        <RefreshCw className="animate-spin" style={{ width: 12, height: 12 }} />
                        Waiting for code…
                      </span>
                    </p>
                  )}
                </div>
              )}

              {s.loginStatus.message && (
                <div style={{ 
                  padding: '12px', 
                  borderRadius: '10px', 
                  fontSize: '11px', 
                  fontWeight: '600', 
                  textAlign: 'center',
                  backgroundColor: s.loginStatus.status === 'success' ? 'rgba(16, 185, 129, 0.05)' :
                                   s.loginStatus.status === 'mfa_required' ? 'rgba(245, 158, 11, 0.05)' :
                                   s.loginStatus.status === 'processing' ? 'rgba(139, 92, 246, 0.05)' :
                                   'rgba(244, 63, 94, 0.05)',
                  border: s.loginStatus.status === 'success' ? '1px solid rgba(16, 185, 129, 0.2)' :
                          s.loginStatus.status === 'mfa_required' ? '1px solid rgba(245, 158, 11, 0.2)' :
                          s.loginStatus.status === 'processing' ? '1px solid rgba(139, 92, 246, 0.2)' :
                          '1px solid rgba(244, 63, 94, 0.2)',
                  color: s.loginStatus.status === 'success' ? '#34d399' :
                         s.loginStatus.status === 'mfa_required' ? '#fbbf24' :
                         s.loginStatus.status === 'processing' ? '#a78bfa' :
                         '#fb7185'
                }}>
                  {s.loginStatus.message}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  s.loading
                  || (s.loginStatus.status === "mfa_required" && s.loginStatus.challenge_type === "prompt")
                  || (s.loginStatus.status === "mfa_required"
                    && ["sms", "email"].includes(s.loginStatus.challenge_type)
                    && !s.loginStatus.challenge_issued)
                }
                className="btn-primary"
                style={{ 
                  width: '100%', 
                  padding: '12px', 
                  justifyContent: 'center', 
                  fontSize: '11px', 
                  fontWeight: '900', 
                  borderRadius: '12px',
                  opacity: s.loading ? 0.65 : 1,
                  cursor: s.loading ? 'not-allowed' : 'pointer'
                }}
              >
                {s.loading && <RefreshCw className="animate-spin" style={{ width: 14, height: 14 }} />}
                {s.loginStatus.status === "mfa_required"
                  ? (s.loginStatus.challenge_type === "prompt"
                    ? "Waiting for App Approval…"
                    : (s.loginStatus.challenge_issued ? "Verify Code & Link" : "Waiting for Code…"))
                  : (s.loading ? "Linking Account..." : "Initiate Login")}
              </button>

              <button
                type="button"
                onClick={s.handleStayOffline}
                disabled={s.loading}
                className="font-size-btn"
                style={{
                  width: '100%',
                  padding: '10px',
                  justifyContent: 'center',
                  fontSize: '10px',
                  fontWeight: '700',
                  borderRadius: '10px',
                  opacity: s.loading ? 0.55 : 0.85,
                  cursor: s.loading ? 'not-allowed' : 'pointer',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                }}
              >
                Stay offline — use manual entry or paste import instead
              </button>

            </form>
          </div>
        </div>,
    document.body
  );
}
