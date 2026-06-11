// ./sidekick/src/app/components/TabErrorBoundary.jsx
/**
 * Catches tab render failures so Android WebView does not show a blank panel.
 */
import { Component } from 'react';

export default class TabErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(`[TabErrorBoundary:${this.props.tabId}]`, error, info);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.tabId !== this.props.tabId && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="tab-loading-fallback" style={{ color: 'var(--text-secondary)' }}>
          <p style={{ margin: '0 0 12px', fontWeight: 800 }}>This view failed to load.</p>
          <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5 }}>
            {this.state.error.message || 'Unknown error'}
          </p>
          <button
            type="button"
            className="sync-overlay-cancel-btn"
            style={{ marginTop: 16 }}
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
