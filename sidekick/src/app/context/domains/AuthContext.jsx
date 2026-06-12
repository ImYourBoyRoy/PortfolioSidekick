// ./sidekick/src/app/context/domains/AuthContext.jsx
import { createDomainContext } from './createDomainContext.jsx';

const { DomainProvider, useDomain } = createDomainContext('SidekickAuth');

export const AuthProvider = DomainProvider;
// eslint-disable-next-line react-refresh/only-export-components -- domain consumer hook
export const useAuth = useDomain;
