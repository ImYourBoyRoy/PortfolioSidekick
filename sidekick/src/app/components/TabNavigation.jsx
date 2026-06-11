// ./sidekick/src/app/components/TabNavigation.jsx
/**
 * Extracted from App.jsx — state via useSidekick().
 * Created by: Roy Dawson IV
 */
import { TrendingUp, LayoutDashboard, Sliders, Brain, Target, Eye, Settings, Newspaper, Landmark } from 'lucide-react';
import { useSidekick } from '../context/SidekickContext';

export default function TabNavigation() {
  const s = useSidekick();

  return (
      <div className="tab-navigation-wrapper">
        <div className="tab-nav-panel">
          <button
            onClick={() => s.setActiveTab("dashboard")}
            className={`tab-nav-btn ${s.activeTab === "dashboard" ? 'tab-nav-btn-active' : ''}`}
          >
            <LayoutDashboard style={{ width: 14, height: 14 }} />
            Overview
          </button>
          <button
            onClick={() => s.setActiveTab("coach")}
            className={`tab-nav-btn ${s.activeTab === "coach" ? 'tab-nav-btn-active' : ''}`}
          >
            <TrendingUp style={{ width: 14, height: 14 }} />
            Coach Chart
          </button>
          <button
            onClick={() => s.setActiveTab("oracle")}
            className={`tab-nav-btn ${s.activeTab === "oracle" ? 'tab-nav-btn-active' : ''}`}
          >
            <Brain style={{ width: 14, height: 14 }} />
            Oracle
          </button>
          <button
            onClick={() => s.setActiveTab("strategy")}
            className={`tab-nav-btn ${s.activeTab === "strategy" ? 'tab-nav-btn-active' : ''}`}
          >
            <Sliders style={{ width: 14, height: 14 }} />
            Strategy
          </button>
          <button
            onClick={() => s.setActiveTab("strength")}
            className={`tab-nav-btn ${s.activeTab === "strength" ? 'tab-nav-btn-active' : ''}`}
          >
            <Target style={{ width: 14, height: 14 }} />
            Strength
          </button>
          <button
            onClick={() => s.setActiveTab("shadow")}
            className={`tab-nav-btn ${s.activeTab === "shadow" ? 'tab-nav-btn-active' : ''}`}
          >
            <Eye style={{ width: 14, height: 14 }} />
            Shadow Coach
          </button>
          <button
            onClick={() => s.setActiveTab("news")}
            className={`tab-nav-btn ${s.activeTab === "news" ? 'tab-nav-btn-active' : ''}`}
          >
            <Newspaper style={{ width: 14, height: 14 }} />
            News
          </button>
          <button
            onClick={() => s.setActiveTab("insider")}
            className={`tab-nav-btn ${s.activeTab === "insider" ? 'tab-nav-btn-active' : ''}`}
          >
            <Landmark style={{ width: 14, height: 14 }} />
            Insider
          </button>
          <button
            onClick={() => s.setActiveTab("settings")}
            className={`tab-nav-btn ${s.activeTab === "settings" ? 'tab-nav-btn-active' : ''}`}
          >
            <Settings style={{ width: 14, height: 14 }} />
            Settings
          </button>
        </div>
      </div>
  );
}
