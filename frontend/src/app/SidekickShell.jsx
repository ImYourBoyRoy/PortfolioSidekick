// ./frontend/src/app/SidekickShell.jsx
/**
 * Main layout shell — header, tabs, modals, and tab panel router.
 * Created by: Roy Dawson IV
 */
import { lazy, Suspense } from 'react';
import { useSidekick } from './context/SidekickContext';
import WelcomeScreen from './components/WelcomeScreen';
import AppHeader from './components/AppHeader';
import TabNavigation from './components/TabNavigation';
import AppFooter from './components/AppFooter';
import ToastStack from './components/ToastStack';
import SyncOverlay from './components/SyncOverlay';
import ProfileModal from './components/modals/ProfileModal';
import ImportModal from './components/modals/ImportModal';
import LoginModal from './components/modals/LoginModal';

const DashboardTab = lazy(() => import('./tabs/DashboardTab'));
const CoachTab = lazy(() => import('./tabs/CoachTab'));
const OracleTab = lazy(() => import('./tabs/OracleTab'));
const StrategyTab = lazy(() => import('./tabs/StrategyTab'));
const StrengthTab = lazy(() => import('./tabs/StrengthTab'));
const ShadowTab = lazy(() => import('./tabs/ShadowTab'));
const NewsTab = lazy(() => import('./tabs/NewsTab'));
const SettingsTab = lazy(() => import('./tabs/SettingsTab'));

export default function SidekickShell() {
  const s = useSidekick();

  if (s.profiles.length === 0 && !s.loading) {
    return <WelcomeScreen />;
  }

  return (
    <div className="app-container">
      <AppHeader />
      <TabNavigation />

      <Suspense fallback={<div className="animate-fade-in tab-loading-fallback">Loading view…</div>}>
        {s.activeTab === 'dashboard' && <DashboardTab />}
        {s.activeTab === 'coach' && <CoachTab />}
        {s.activeTab === 'oracle' && <OracleTab />}
        {s.activeTab === 'strategy' && <StrategyTab />}
        {s.activeTab === 'strength' && <StrengthTab />}
        {s.activeTab === 'shadow' && <ShadowTab />}
        {s.activeTab === 'news' && <NewsTab />}
        {s.activeTab === 'settings' && <SettingsTab />}
      </Suspense>

      <ProfileModal />
      <ImportModal />
      <LoginModal />
      <SyncOverlay />
      <ToastStack />
      <AppFooter />
    </div>
  );
}
