// ./sidekick/src/app/context/domains/StrategyContext.jsx
import { createDomainContext } from './createDomainContext.jsx';

const { DomainProvider, useDomain } = createDomainContext('SidekickStrategy');

export const StrategyProvider = DomainProvider;
// eslint-disable-next-line react-refresh/only-export-components -- domain consumer hook
export const useStrategy = useDomain;
