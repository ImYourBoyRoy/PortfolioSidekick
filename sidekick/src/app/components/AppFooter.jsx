// ./sidekick/src/app/components/AppFooter.jsx
/**
 * Extracted from App.jsx — state via useSidekick().
 * Created by: Roy Dawson IV
 */
import { useProfiles, usePortfolio } from '../context/SidekickContext';

export default function AppFooter() {
  const { activeProfile } = useProfiles();
  const { hasCachedRobinhoodSession, isSandbox } = usePortfolio();
  const isLinked = hasCachedRobinhoodSession || Boolean(activeProfile?.robinhood_username);
  const isLive = isLinked && !isSandbox;

  return (
      <footer className="app-footer">
        <div className="status-footer-badge-box">
          <div className={`status-footer-indicator-light ${isLive ? 'status-live-light' : 'status-sandbox-light'}`}></div>
          <span>Execution Mode: <strong className={isLive ? 'text-highlight-green' : 'text-highlight-purple'}>{isLive ? 'Live Robinhood Session Active' : 'Offline Portfolio Tracking'}</strong></span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '10px' }}>
          <span>Created by <a href="https://imyourboyroy.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-oracle)', fontWeight: '800', textDecoration: 'underline' }}>Roy Dawson IV</a></span>
          <span style={{ color: 'var(--border-light)' }}>|</span>
          <a href="https://github.com/imyourboyroy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)', textDecoration: 'underline' }}>GitHub Source</a>
        </div>
      </footer>
  );
}
