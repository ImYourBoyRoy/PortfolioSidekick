// ./sidekick/src/app/context/domains/MarketContext.jsx
import { createDomainContext } from './createDomainContext.jsx';

const { DomainProvider, useDomain } = createDomainContext('SidekickMarket');

export const MarketProvider = DomainProvider;
// eslint-disable-next-line react-refresh/only-export-components -- domain consumer hook
export const useMarket = useDomain;
