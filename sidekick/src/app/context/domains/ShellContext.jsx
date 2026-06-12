// ./sidekick/src/app/context/domains/ShellContext.jsx
import { createDomainContext } from './createDomainContext.jsx';

const { DomainProvider, useDomain } = createDomainContext('SidekickShell');

export const ShellProvider = DomainProvider;
// eslint-disable-next-line react-refresh/only-export-components -- domain consumer hook
export const useShell = useDomain;
