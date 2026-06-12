// ./sidekick/src/app/context/domains/OracleContext.jsx
import { createDomainContext } from './createDomainContext.jsx';

const { DomainProvider, useDomain } = createDomainContext('SidekickOracle');

export const OracleProvider = DomainProvider;
// eslint-disable-next-line react-refresh/only-export-components -- domain consumer hook
export const useOracle = useDomain;
