// ./sidekick/src/app/components/modals/LoginModal.jsx
/**
 * Extracted from App.jsx — state via useSidekick().
 * Created by: Roy Dawson IV
 */
import { createPortal } from 'react-dom';
import { ShieldAlert, RefreshCw, X, Sliders } from 'lucide-react';
import { useAuth, useShell } from '../../context/SidekickContext';

export default function LoginModal() {
  const {
    isLoginOpen, setIsLoginOpen, loginForm, setLoginForm,
    loginStatus, handleLogin, handleStayOffline, desktopAuthProbe,
    desktopAuthReadyMessage, authShellIsReady,
  } = useAuth();
  const { loading } = useShell();

  if (!isLoginOpen) return null;

  return createPortal(
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Robinhood login">
          <div className="glass-card modal-card">
            <button 
              onClick={() => {
                if (!loading) setIsLoginOpen(false);
              }}
              disabled={loading}
              className="modal-close-btn"
              style={{ cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}
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
              {desktopAuthProbe && desktopAuthProbe.platform !== 'dev' && (
                <p
                  className="modal-subtitle"
                  style={{
                    fontSize: '10px',
                    lineHeight: '1.45',
                    margin: '10px 8px 0',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: authShellIsReady(desktopAuthProbe)
                      ? '1px solid rgba(16, 185, 129, 0.35)'
                      : '1px solid rgba(251, 191, 36, 0.45)',
                    color: authShellIsReady(desktopAuthProbe)
                      ? 'var(--color-buy)'
                      : '#fbbf24',
                    background: authShellIsReady(desktopAuthProbe)
                      ? 'rgba(16, 185, 129, 0.08)'
                      : 'rgba(251, 191, 36, 0.08)',
                  }}
                >
                  {desktopAuthReadyMessage(desktopAuthProbe)}
                </p>
              )}
            </div>

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <label className="input-label">Robinhood Username</label>
                <input
                  type="email"
                  required
                  disabled={loading}
                  placeholder="e.g. name@gmail.com"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm(prev => ({ ...prev, username: e.target.value }))}
                  className="form-input-text"
                  style={{ opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'default' }}
                />
              </div>

              <div className="input-group">
                <label className="input-label">Robinhood Password</label>
                <input
                  type="password"
                  required
                  disabled={loading}
                  placeholder="••••••••••••"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                  className="form-input-text"
                  style={{ opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'default' }}
                />
              </div>

              {loginStatus.status === "mfa_required" && (
                <div className="input-group" style={{ borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
                  <label className="input-label animate-pulse" style={{ color: 'var(--color-buy)', fontWeight: '900', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ShieldAlert style={{ width: 14, height: 14 }} />
                    {loginStatus.challenge_type === "prompt"
                      ? "Robinhood App Push Approval Required"
                      : loginStatus.challenge_type === "email"
                        ? "Enter Email Verification Code"
                        : "Enter SMS Verification Code"}
                  </label>
                  {loginStatus.challenge_type === "prompt" ? (
                    <>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', margin: '8px 0', lineHeight: 1.6 }}>
                        Open your <strong style={{ color: 'var(--color-buy)' }}>Robinhood mobile app</strong> and approve the login notification.
                        We&apos;ll detect it automatically.
                        <br />
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, color: '#fbbf24' }}>
                          <RefreshCw className="animate-spin" style={{ width: 12, height: 12 }} />
                          {loginStatus.message?.includes('processing') || loginStatus.message?.includes('finishing')
                            ? 'Finishing login…'
                            : (loginStatus.message || 'Waiting for approval…')}
                        </span>
                      </p>
                      <input
                        type="text"
                        disabled={loading}
                        placeholder="SMS code (if Robinhood sent one)"
                        value={loginForm.mfa_code}
                        onChange={(e) => setLoginForm(prev => ({ ...prev, mfa_code: e.target.value }))}
                        className="form-input-text"
                        style={{ letterSpacing: '0.25em', textAlign: 'center', fontWeight: '800', marginTop: 8, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'default' }}
                      />
                    </>
                  ) : loginStatus.challenge_issued ? (
                    <input
                      type="text"
                      required
                      disabled={loading}
                      placeholder="e.g. 123456"
                      value={loginForm.mfa_code}
                      onChange={(e) => setLoginForm(prev => ({ ...prev, mfa_code: e.target.value }))}
                      className="form-input-text"
                      autoFocus
                      style={{ letterSpacing: '0.25em', textAlign: 'center', fontWeight: '800', opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'default' }}
                    />
                  ) : (
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', margin: '8px 0', lineHeight: 1.6 }}>
                      Robinhood is sending your {loginStatus.challenge_type} code…
                      <br />
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, color: '#fbbf24' }}>
                        <RefreshCw className="animate-spin" style={{ width: 12, height: 12 }} />
                        Waiting for code…
                      </span>
                    </p>
                  )}
                </div>
              )}

              {loginStatus.message && (
                <div style={{ 
                  padding: '12px', 
                  borderRadius: '10px', 
                  fontSize: '11px', 
                  fontWeight: '600', 
                  textAlign: 'center',
                  backgroundColor: loginStatus.status === 'success' ? 'rgba(16, 185, 129, 0.05)' :
loginStatus.status === 'mfa_required' ? 'rgba(245, 158, 11, 0.05)' :
loginStatus.status === 'processing' ? 'rgba(139, 92, 246, 0.05)' :
                                   'rgba(244, 63, 94, 0.05)',
                  border: loginStatus.status === 'success' ? '1px solid rgba(16, 185, 129, 0.2)' :
loginStatus.status === 'mfa_required' ? '1px solid rgba(245, 158, 11, 0.2)' :
loginStatus.status === 'processing' ? '1px solid rgba(139, 92, 246, 0.2)' :
                          '1px solid rgba(244, 63, 94, 0.2)',
                  color: loginStatus.status === 'success' ? '#34d399' :
loginStatus.status === 'mfa_required' ? '#fbbf24' :
loginStatus.status === 'processing' ? '#a78bfa' :
                         '#fb7185'
                }}>
                  {loginStatus.message}
                </div>
              )}

              <button
                type="submit"
                disabled={
loading
                  || (loginStatus.status === "mfa_required" && loginStatus.challenge_type === "prompt")
                  || (loginStatus.status === "mfa_required"
                    && ["sms", "email"].includes(loginStatus.challenge_type)
                    && !loginStatus.challenge_issued)
                }
                className="btn-primary"
                style={{ 
                  width: '100%', 
                  padding: '12px', 
                  justifyContent: 'center', 
                  fontSize: '11px', 
                  fontWeight: '900', 
                  borderRadius: '12px',
                  opacity: loading ? 0.65 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading && <RefreshCw className="animate-spin" style={{ width: 14, height: 14 }} />}
                {loginStatus.status === "mfa_required"
                  ? (loginStatus.challenge_type === "prompt"
                    ? "Waiting for App Approval…"
                    : (loginStatus.challenge_issued ? "Verify Code & Link" : "Waiting for Code…"))
                  : (loading ? "Linking Account..." : "Initiate Login")}
              </button>

              <button
                type="button"
                onClick={handleStayOffline}
                disabled={loading}
                className="font-size-btn"
                style={{
                  width: '100%',
                  padding: '10px',
                  justifyContent: 'center',
                  fontSize: '10px',
                  fontWeight: '700',
                  borderRadius: '10px',
                  opacity: loading ? 0.55 : 0.85,
                  cursor: loading ? 'not-allowed' : 'pointer',
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
