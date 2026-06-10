// ./sidekick/src/app/context/SidekickContext.jsx
/**
 * React context for Portfolio Sidekick app state and actions.
 * Created by: Roy Dawson IV
 */
import { createContext, useContext } from 'react';
import { useSidekickApp } from '../hooks/useSidekickApp';

const SidekickContext = createContext(null);

export function SidekickProvider({ children }) {
  const value = useSidekickApp();
  return (
    <SidekickContext.Provider value={value}>
      {children}
    </SidekickContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- context consumer hook paired with provider
export function useSidekick() {
  const ctx = useContext(SidekickContext);
  if (!ctx) {
    throw new Error('useSidekick must be used within SidekickProvider');
  }
  return ctx;
}
