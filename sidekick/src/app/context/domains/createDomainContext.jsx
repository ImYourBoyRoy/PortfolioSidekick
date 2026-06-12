// ./sidekick/src/app/context/domains/createDomainContext.jsx
/**
 * Factory for isolated domain React contexts with stable provider wiring.
 * Created by: Roy Dawson IV
 */
import { createContext, useContext, useMemo } from 'react';

export function createDomainContext(displayName) {
  const Ctx = createContext(null);
  Ctx.displayName = displayName;

  function useDomain() {
    const value = useContext(Ctx);
    if (!value) {
      throw new Error(`${displayName} must be used within its Provider`);
    }
    return value;
  }

  function DomainProvider({ value, children }) {
    const memo = useMemo(() => value, [value]);
    return <Ctx.Provider value={memo}>{children}</Ctx.Provider>;
  }

  return { DomainProvider, useDomain, DomainContext: Ctx };
}
