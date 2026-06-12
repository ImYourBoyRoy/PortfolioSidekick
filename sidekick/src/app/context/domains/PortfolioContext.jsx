// ./sidekick/src/app/context/domains/PortfolioContext.jsx
import { createDomainContext } from './createDomainContext.jsx';

const { DomainProvider, useDomain } = createDomainContext('SidekickPortfolio');

export const PortfolioProvider = DomainProvider;
// eslint-disable-next-line react-refresh/only-export-components -- domain consumer hook
export const usePortfolio = useDomain;
