// ./frontend/src/app/components/TabNavigation.jsx
/**
 * Extracted from App.jsx — state via useSidekick().
 * Created by: Roy Dawson IV
 */
import { TrendingUp, LayoutDashboard, Sliders, Brain, Target, Eye, ZoomIn, ZoomOut, Settings, Newspaper } from 'lucide-react';
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
            Interactive Coach Chart
          </button>
          <button
            onClick={() => s.setActiveTab("oracle")}
            className={`tab-nav-btn ${s.activeTab === "oracle" ? 'tab-nav-btn-active' : ''}`}
          >
            <Brain style={{ width: 14, height: 14 }} />
            Oracle Predictions
          </button>
          <button
            onClick={() => s.setActiveTab("strategy")}
            className={`tab-nav-btn ${s.activeTab === "strategy" ? 'tab-nav-btn-active' : ''}`}
          >
            <Sliders style={{ width: 14, height: 14 }} />
            Tactical Strategy Planner
          </button>
          <button
            onClick={() => s.setActiveTab("strength")}
            className={`tab-nav-btn ${s.activeTab === "strength" ? 'tab-nav-btn-active' : ''}`}
          >
            <Target style={{ width: 14, height: 14 }} />
            Strength Analyzer
          </button>
          <button
            onClick={() => s.setActiveTab("shadow")}
            className={`tab-nav-btn ${s.activeTab === "shadow" ? 'tab-nav-btn-active' : ''}`}
          >
            <Eye style={{ width: 14, height: 14 }} />
            Watch What I Do
          </button>
          <button
            onClick={() => s.setActiveTab("news")}
            className={`tab-nav-btn ${s.activeTab === "news" ? 'tab-nav-btn-active' : ''}`}
          >
            <Newspaper style={{ width: 14, height: 14 }} />
            Market News
          </button>
          <button
            onClick={() => s.setActiveTab("settings")}
            className={`tab-nav-btn ${s.activeTab === "settings" ? 'tab-nav-btn-active' : ''}`}
          >
            <Settings style={{ width: 14, height: 14 }} />
            Advanced Settings
          </button>
        </div>
        {/* Accessibility Controls — Font Sizing & Contrast */}
        <div className="accessibility-controls-bar">
          <button
            onClick={() => s.adjustFontSize(-1)}
            className="font-size-btn"
            title="Decrease font size"
            disabled={s.fontSizeOffset <= -3}
          >
            <ZoomOut style={{ width: 13, height: 13 }} />
          </button>
          <span className="font-size-indicator" title="Font size adjustment">{s.fontSizeOffset > 0 ? `+${s.fontSizeOffset}` : s.fontSizeOffset}</span>
          <button
            onClick={() => s.adjustFontSize(1)}
            className="font-size-btn"
            title="Increase font size"
            disabled={s.fontSizeOffset >= 5}
          >
            <ZoomIn style={{ width: 13, height: 13 }} />
          </button>
          <button
            onClick={() => s.setFontSizeOffset(0)}
            className="font-size-btn font-reset-btn"
            title="Reset font size to default"
          >
            Reset
          </button>
        </div>
      </div>
  );
}
