// ./sidekick/src/app/context/domains/ProfilesContext.jsx
import { createDomainContext } from './createDomainContext.jsx';

const { DomainProvider, useDomain } = createDomainContext('SidekickProfiles');

export const ProfilesProvider = DomainProvider;
// eslint-disable-next-line react-refresh/only-export-components -- domain consumer hook
export const useProfiles = useDomain;
