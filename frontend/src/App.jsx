// ./frontend/src/App.jsx
/**
 * Portfolio Sidekick — thin entry that mounts context + shell.
 * Created by: Roy Dawson IV
 */
import { SidekickProvider } from './app/context/SidekickContext';
import SidekickShell from './app/SidekickShell';

export default function App() {
  return (
    <SidekickProvider>
      <SidekickShell />
    </SidekickProvider>
  );
}
