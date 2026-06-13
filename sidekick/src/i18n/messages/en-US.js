// ./sidekick/src/i18n/messages/en-US.js
/** Canonical en-US strings — fallback catalog for all locales. */
export const enUS = {
  'tabs.overview': 'Overview',
  'tabs.coach': 'Coach Chart',
  'tabs.oracle': 'Oracle',
  'tabs.strategy': 'Strategy',
  'tabs.strength': 'Strength',
  'tabs.shadow': 'Shadow Coach',
  'tabs.news': 'News',
  'tabs.insider': 'Insider',
  'tabs.settings': 'Settings',

  'welcome.title': 'Welcome to Portfolio Sidekick',
  'welcome.subtitle':
    'Create your local, private profile to begin tracking portfolios, predicting stock movements, and evolving indicator weights. Connecting a live Robinhood account is 100% optional! You can use this app purely as an offline tracker and simulator. All data remains strictly secure and isolated on this machine.',
  'welcome.profileLabel': 'Enter Profile Name',
  'welcome.profilePlaceholder': 'e.g. Main Portfolio or Swing Trading',
  'welcome.createButton': 'Create Local Profile',

  'shell.loadingTab': 'Loading tab…',

  'header.taglineLinked': 'Live Robinhood · Local & Private',
  'header.taglineLocal': 'Local Privacy-Preserved Companion',
  'header.menu': 'Menu',
  'header.updateAvailable': 'Update v{version} available',
  'header.version': 'App version',

  'sync.titleBootstrap': 'Please Wait — Loading Portfolio',
  'sync.titleSync': 'Active Robinhood Link In Progress',
  'sync.subtitleBootstrap': 'Restoring saved session',
  'sync.subtitleSync': 'Synchronizing live positions',
  'sync.hintBootstrap':
    'Your encrypted Robinhood session is on this device. We are restoring holdings and refreshing live quotes — this may take a few seconds.',
  'sync.hintSync':
    'Your Robinhood session is stored only on this device. Credentials are never synced to other platforms or cloud servers.',
  'sync.step0': 'Securing encrypted network tunnel to Robinhood APIs...',
  'sync.step1': 'Authenticating local session with secure challenge tokens...',
  'sync.step2': 'Retrieving portfolio asset positions and historical metrics...',
  'sync.step3': 'Calibrating Multi-Horizon quantitative Trade Viability Oracle...',
  'sync.step4': 'Synthesizing AI coaching insights in local Shadow Coach DB...',
  'sync.cancel': 'Cancel sync',

  'update.bannerTitle': 'Update available — v{version}',
  'update.bannerBody':
    'You are on v{current}. Apply the portable {platform} build — Sidekick restarts automatically on desktop.',
  'update.preparing': 'Preparing…',
  'update.updateButton': 'Update to v{version}',
  'update.details': 'Details',
  'update.dismissAria': 'Dismiss update banner until next check',
  'update.platformBuild': '{platform} build',
  'update.yourPlatform': 'your platform',

  'settings.languageTitle': 'Language',
  'settings.languageHint':
    'Uses your device language by default. Choose a language below to override, or pick System default to follow the device again.',
  'settings.languageSelectLabel': 'Display language',
  'settings.languageSystem': 'System default ({language})',
  'settings.languageCurrent': 'Showing {language}',
};
