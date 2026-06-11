// ./sidekick/src/app/SidekickShell.jsx

/**

 * Main layout shell — sidebar, header, tabs, modals.

 */

import { useState } from 'react';

import { useSidekick } from './context/SidekickContext';

import WelcomeScreen from './components/WelcomeScreen';

import AppHeader from './components/AppHeader';

import AppSidebar from './components/AppSidebar';

import TabNavigation from './components/TabNavigation';

import AppFooter from './components/AppFooter';

import ToastStack from './components/ToastStack';

import SyncOverlay from './components/SyncOverlay';

import TabErrorBoundary from './components/TabErrorBoundary';

import ProfileModal from './components/modals/ProfileModal';

import ImportModal from './components/modals/ImportModal';

import LoginModal from './components/modals/LoginModal';

import CatalystWatchModal from './components/modals/CatalystWatchModal';

import DashboardTab from './tabs/DashboardTab';

import CoachTab from './tabs/CoachTab';

import OracleTab from './tabs/OracleTab';

import StrategyTab from './tabs/StrategyTab';

import StrengthTab from './tabs/StrengthTab';

import ShadowTab from './tabs/ShadowTab';

import NewsTab from './tabs/NewsTab';

import InsiderTab from './tabs/InsiderTab';

import SettingsTab from './tabs/SettingsTab';



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

        <TabNavigation />



        <div className="tab-content-shell">

          <TabErrorBoundary tabId={s.activeTab} key={s.activeTab}>

            <ActiveTab />

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

