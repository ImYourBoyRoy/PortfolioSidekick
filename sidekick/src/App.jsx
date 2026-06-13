// ./sidekick/src/App.jsx
/**
 * Portfolio Sidekick — thin entry that mounts context + shell.
 * Created by: Roy Dawson IV
 */
import { SidekickProvider } from './app/context/SidekickContext';
import SidekickShell from './app/SidekickShell';
import { I18nProvider } from './i18n';

export default function App() {
  return (
    <I18nProvider>
      <SidekickProvider>
        <SidekickShell />
      </SidekickProvider>
    </I18nProvider>
  );
}
