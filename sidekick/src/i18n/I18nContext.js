// ./sidekick/src/i18n/I18nContext.js
import { createContext } from 'react';

/** @type {import('react').Context<import('./I18nProvider.jsx').I18nContextValue | null>} */
export const I18nContext = createContext(null);
