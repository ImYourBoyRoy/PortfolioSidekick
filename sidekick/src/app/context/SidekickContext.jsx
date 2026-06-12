// ./sidekick/src/app/context/SidekickContext.jsx
/**
 * React context for Portfolio Sidekick — nested domain providers + legacy flat merge.
 * Created by: Roy Dawson IV
 */
import { createContext, useContext, useMemo } from 'react';
import { useSidekickDomains } from '../hooks/useSidekickApp';
import { ShellProvider } from './domains/ShellContext';
import { ProfilesProvider } from './domains/ProfilesContext';
import { PortfolioProvider } from './domains/PortfolioContext';
import { AuthProvider } from './domains/AuthContext';
import { CoachProvider } from './domains/CoachContext';
import { OracleProvider } from './domains/OracleContext';
import { MarketProvider } from './domains/MarketContext';
import { StrategyProvider } from './domains/StrategyContext';

const SidekickLegacyContext = createContext(null);

function SidekickLegacyBridge({
  shell, profiles, portfolio, auth, coach, oracle, market, strategy, children,
}) {
  const legacy = useMemo(
    () => ({
      ...shell,
      ...profiles,
      ...portfolio,
      ...auth,
      ...coach,
      ...oracle,
      ...market,
      ...strategy,
    }),
    [shell, profiles, portfolio, auth, coach, oracle, market, strategy],
  );
  return (
    <SidekickLegacyContext.Provider value={legacy}>
      {children}
    </SidekickLegacyContext.Provider>
  );
}

export function SidekickProvider({ children }) {
  const {
    shell, profiles, portfolio, auth, coach, oracle, market, strategy,
  } = useSidekickDomains();

  return (
    <ShellProvider value={shell}>
      <ProfilesProvider value={profiles}>
        <PortfolioProvider value={portfolio}>
          <AuthProvider value={auth}>
            <CoachProvider value={coach}>
              <MarketProvider value={market}>
                <StrategyProvider value={strategy}>
                  <OracleProvider value={oracle}>
                    <SidekickLegacyBridge
                      shell={shell}
                      profiles={profiles}
                      portfolio={portfolio}
                      auth={auth}
                      coach={coach}
                      oracle={oracle}
                      market={market}
                      strategy={strategy}
                    >
                      {children}
                    </SidekickLegacyBridge>
                  </OracleProvider>
                </StrategyProvider>
              </MarketProvider>
            </CoachProvider>
          </AuthProvider>
        </PortfolioProvider>
      </ProfilesProvider>
    </ShellProvider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- context consumer hook paired with provider
export function useSidekick() {
  const ctx = useContext(SidekickLegacyContext);
  if (!ctx) {
    throw new Error('useSidekick must be used within SidekickProvider');
  }
  return ctx;
}

// eslint-disable-next-line react-refresh/only-export-components -- domain hooks colocated with provider
export { useShell } from './domains/ShellContext';
// eslint-disable-next-line react-refresh/only-export-components -- domain hooks colocated with provider
export { useProfiles } from './domains/ProfilesContext';
// eslint-disable-next-line react-refresh/only-export-components -- domain hooks colocated with provider
export { usePortfolio } from './domains/PortfolioContext';
// eslint-disable-next-line react-refresh/only-export-components -- domain hooks colocated with provider
export { useAuth } from './domains/AuthContext';
// eslint-disable-next-line react-refresh/only-export-components -- domain hooks colocated with provider
export { useCoach } from './domains/CoachContext';
// eslint-disable-next-line react-refresh/only-export-components -- domain hooks colocated with provider
export { useOracle } from './domains/OracleContext';
// eslint-disable-next-line react-refresh/only-export-components -- domain hooks colocated with provider
export { useMarket } from './domains/MarketContext';
// eslint-disable-next-line react-refresh/only-export-components -- domain hooks colocated with provider
export { useStrategy } from './domains/StrategyContext';
