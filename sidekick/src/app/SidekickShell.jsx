// ./sidekick/src/app/SidekickShell.jsx
/**
 * Main layout shell — sidebar, header, tabs, modals.
 * Tabs are lazy-loaded to keep initial desktop/Android startup fast.
 *
 * Created by: Roy Dawson IV
 */

import { lazy, Suspense, useState } from 'react';
import { useSidekick } from './context/SidekickContext';
import WelcomeScreen from './components/WelcomeScreen';
import AppHeader from './components/AppHeader';
import AppSidebar from './components/AppSidebar';
import TabNavigation from './components/TabNavigation';
import AppFooter from './components/AppFooter';
import ToastStack from './components/ToastStack';
import SyncOverlay from './components/SyncOverlay';
import UpdateBanner from './components/UpdateBanner';
import TabErrorBoundary from './components/TabErrorBoundary';
import ProfileModal from './components/modals/ProfileModal';
import ImportModal from './components/modals/ImportModal';
import LoginModal from './components/modals/LoginModal';
import CatalystWatchModal from './components/modals/CatalystWatchModal';

const DashboardTab = lazy(() => import('./tabs/DashboardTab'));
const CoachTab = lazy(() => import('./tabs/CoachTab'));
const OracleTab = lazy(() => import('./tabs/OracleTab'));
const StrategyTab = lazy(() => import('./tabs/StrategyTab'));
const StrengthTab = lazy(() => import('./tabs/StrengthTab'));
const ShadowTab = lazy(() => import('./tabs/ShadowTab'));
const NewsTab = lazy(() => import('./tabs/NewsTab'));
const InsiderTab = lazy(() => import('./tabs/InsiderTab'));
const SettingsTab = lazy(() => import('./tabs/SettingsTab'));

const TAB_PANELS = {
  dashboard: DashboardTab,
  coach: CoachTab,
  oracle: OracleTab,
  strategy: StrategyTab,
  strength: StrengthTab,
  shadow: ShadowTab,
  news: NewsTab,
  insider: InsiderTab,
  settings: SettingsTab,
};

function TabLoadingFallback() {
  return (
    <div className="glass-card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
      Loading tab…
    </div>
  );
}

export default function SidekickShell() {
  const s = useSidekick();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (s.profiles.length === 0 && !s.loading) {
    return <WelcomeScreen />;
  }

  const ActiveTab = TAB_PANELS[s.activeTab] || DashboardTab;

  return (
    <div className="app-container app-shell">
      <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="app-main">
        <AppHeader onMenuOpen={() => setSidebarOpen(true)} />
        <UpdateBanner />
        <TabNavigation />

        <div className="tab-content-shell">
          <TabErrorBoundary tabId={s.activeTab} key={s.activeTab}>
            <Suspense fallback={<TabLoadingFallback />}>
              <ActiveTab />
            </Suspense>
          </TabErrorBoundary>
          {(s.syncing || s.portfolioBootstrapping) && <SyncOverlay />}
        </div>

        <AppFooter />
      </div>

      <ProfileModal />
      <ImportModal />
      <LoginModal />
      <CatalystWatchModal />
      <ToastStack />
    </div>
  );
}
