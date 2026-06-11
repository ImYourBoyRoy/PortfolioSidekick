// ./sidekick/src/serverless/marketBrief.js
/**
 * Curated macro calendar + investor brief — forward events that move portfolios.
 * Refreshed for active market windows; pairs with Catalyst Watch and Forward Prep.
 *
 * Created by: Roy Dawson IV
 */

const MS_DAY = 86400000;

/** @typedef {'ipo'|'fed'|'inflation'|'earnings'|'options'|'geopolitical'|'sector'} MacroCategory */

/**
 * @typedef {object} MacroEvent
 * @property {string} id
 * @property {string} title
 * @property {string} event_date YYYY-MM-DD
 * @property {MacroCategory} category
 * @property {'bullish'|'bearish'|'watch'} bias
 * @property {string} summary
 * @property {string[]} affected_tickers
 * @property {string[]} associated_tickers
 * @property {string[]} themes
 * @property {string[]} investor_prep
 * @property {string[]} risks
 * @property {number} priority 1 = highest
 */

/** Rolling brief — update dates/themes when macro calendar shifts. */
export const MACRO_BRIEF_AS_OF = '2026-06-11';

const MACRO_BRIEF_CACHE_MS = 7 * MS_DAY;
const MACRO_BRIEF_REMOTE_URL =
  'https://raw.githubusercontent.com/imyourboyroy/StockToolkit/main/sidekick/src/serverless/macroBrief.bundle.json';

let macroEventsOverride = null;

/** Active catalog — remote/cache override or bundled June 2026 list. */
export function getMacroEventCatalog() {
  return macroEventsOverride || MACRO_EVENTS_JUNE_2026;
}

export function applyMacroBriefPayload(payload) {
  if (!payload?.events?.length) return false;
  macroEventsOverride = payload.events;
  return true;
}

/**
 * Refresh macro calendar from bundled JSON or optional remote URL (cross-platform fetch).
 * @param {import('./database').localDb} [db]
 */
export async function refreshMacroBriefCache(db) {
  const bundled = await import('./macroBrief.bundle.json').then((m) => m.default || m).catch(() => null);
  if (bundled?.events?.length) {
    applyMacroBriefPayload(bundled);
    if (db?.saveMacroBriefCache) {
      db.saveMacroBriefCache({ fetched_at: Date.now(), as_of: bundled.as_of || MACRO_BRIEF_AS_OF, events: bundled.events, source: 'bundled' });
    }
  }

  const cached = db?.getMacroBriefCache?.();
  if (cached?.events?.length && Date.now() - (cached.fetched_at || 0) < MACRO_BRIEF_CACHE_MS) {
    applyMacroBriefPayload(cached);
    return cached;
  }

  try {
    const { Capacitor } = await import('@capacitor/core');
    let text;
    if (Capacitor.isNativePlatform()) {
      const { CapacitorHttp } = await import('@capacitor/core');
      const res = await CapacitorHttp.get({ url: MACRO_BRIEF_REMOTE_URL, connectTimeout: 20000, readTimeout: 20000 });
      text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    } else {
      const res = await fetch(MACRO_BRIEF_REMOTE_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
    }
    const remote = JSON.parse(text);
    if (remote?.events?.length) {
      applyMacroBriefPayload(remote);
      const row = { fetched_at: Date.now(), as_of: remote.as_of || MACRO_BRIEF_AS_OF, events: remote.events, source: 'remote' };
      db?.saveMacroBriefCache?.(row);
      return row;
    }
  } catch (err) {
    console.warn('[MacroBrief] Remote refresh skipped:', err.message);
  }

  return cached || { events: getMacroEventCatalog(), source: 'bundled', as_of: MACRO_BRIEF_AS_OF };
}

export const MACRO_EVENTS_JUNE_2026 = [
  {
    id: 'spacex-ipo-spcx',
    title: 'SpaceX IPO (SPCX) — Nasdaq debut',
    event_date: '2026-06-12',
    category: 'ipo',
    bias: 'watch',
    summary:
      'SpaceX targets a ~$1.75T valuation in the largest IPO on record. Retail allocation is unusually high (~30%). '
      + 'Innovation and space ETFs (ARKK, ARKX, UFO) often trade the sentiment read — not direct SPCX exposure.',
    affected_tickers: ['ARKK', 'ARKX', 'UFO', 'RKLB', 'ASTS', 'LUNR', 'SPCE', 'TSLA', 'NVDA', 'QQQ', 'PLTR'],
    associated_tickers: ['SPCX', 'UFO', 'ARKX', 'RKLB', 'TSLA', 'QQQ'],
    themes: ['space', 'innovation', 'ai_infra', 'retail_sentiment'],
    investor_prep: [
      'Treat day-one pop as sentiment, not proof of fair value — plan entries after volatility settles.',
      'Watch associated space names for sympathy moves before/after listing.',
      'If holding ARKK, decide core vs trading size before the open.',
    ],
    risks: [
      'IPO euphoria can gap innovation ETFs up then fade within days.',
      'High retail float increases whipsaw risk on disappointment.',
    ],
    priority: 1,
  },
  {
    id: 'fomc-warsh-jun-2026',
    title: 'FOMC — Kevin Warsh\'s first meeting as Fed Chair',
    event_date: '2026-06-17',
    category: 'fed',
    bias: 'watch',
    summary:
      'Markets expect rates on hold (3.50–3.75%) but focus on tone: less easing bias, possible dot-plot changes. '
      + 'Futures have shifted toward hike odds by year-end — higher-for-longer hurts long-duration growth.',
    affected_tickers: ['SPY', 'QQQ', 'IWM', 'TLT', 'ARKK', 'NVDA', 'AMD', 'PLTR', 'QBTS', 'RGTI', 'IONQ', 'XLK'],
    associated_tickers: ['SPY', 'QQQ', 'TLT', 'XLK'],
    themes: ['rates', 'growth', 'volatility'],
    investor_prep: [
      'Reduce oversized rate-sensitive growth into the meeting if conviction is already soft.',
      'Read the statement for "neutral" vs easing bias — often moves QQQ more than the headline hold.',
      'Pair Fed week with catalyst holds: don\'t double leverage into binary macro.',
    ],
    risks: [
      'Hawkish surprise can hit ARKK / quantum / long-duration tech in one session.',
      'Bond yield spikes raise financing costs for capex-heavy AI names.',
    ],
    priority: 1,
  },
  {
    id: 'quad-witching-jun-2026',
    title: 'Quad witching (Juneteenth-adjusted)',
    event_date: '2026-06-18',
    category: 'options',
    bias: 'watch',
    summary:
      'Index & single-stock options expiry pulled forward around the Juneteenth holiday — expect volume spikes '
      + 'and exaggerated moves into the close, especially after SpaceX + FOMC in the same week.',
    affected_tickers: ['SPY', 'QQQ', 'NVDA', 'TSLA', 'AMD', 'AAPL', 'MSFT', 'ARKK'],
    associated_tickers: ['SPY', 'QQQ', 'VIX'],
    themes: ['volatility', 'liquidity'],
    investor_prep: [
      'Avoid sizing up new positions into the expiry print unless thesis is multi-week.',
      'Use limits — market orders near the close can slip on gamma unwind.',
    ],
    risks: ['Pin risk and false breakouts on high-beta holdings.'],
    priority: 2,
  },
  {
    id: 'ai-infra-broadening-2026',
    title: 'AI trade broadening — infra & industrials vs mega-cap',
    event_date: '2026-06-30',
    category: 'sector',
    bias: 'bullish',
    summary:
      'Mid-2026 leadership is rotating from pure mega-cap software toward power, cooling, construction, memory, '
      + 'and hardware enablers. Hyperscaler capex is huge but free-cash-flow scrutiny is rising.',
    affected_tickers: ['NVDA', 'AMD', 'AVGO', 'SMH', 'XLK', 'MSFT', 'GOOGL', 'AMZN', 'META', 'CCJ', 'VST', 'CEG'],
    associated_tickers: ['SMH', 'XLK', 'CCJ', 'VST'],
    themes: ['ai_infra', 'energy', 'semis'],
    investor_prep: [
      'Favor names monetizing physical AI build-out, not only narrative multiples.',
      'Cross-check your portfolio: concentrated software vs diversified infra exposure.',
    ],
    risks: ['Capex fatigue headlines can hit even winners without warning.'],
    priority: 3,
  },
  {
    id: 'inflation-sticky-2026',
    title: 'Sticky inflation — hike odds back on the table',
    event_date: '2026-06-30',
    category: 'inflation',
    bias: 'bearish',
    summary:
      'May CPI near multi-year highs and energy shock spillovers have markets pricing cuts out and hikes in. '
      + 'Growth multiples compress when real yields rise.',
    affected_tickers: ['ARKK', 'QBTS', 'RGTI', 'IONQ', 'PLTR', 'TSLA', 'SMR', 'OKLO'],
    associated_tickers: ['TLT', 'SPY', 'QQQ'],
    themes: ['rates', 'innovation', 'speculative'],
    investor_prep: [
      'Size speculative sleeves smaller when macro regime is inflation + higher rates.',
      'Keep dry powder for post-volatility entries rather than averaging down on weak conviction alone.',
    ],
    risks: ['Long-duration speculative assets often re-rate down first.'],
    priority: 2,
  },
];

const THEME_TICKER_MAP = {
  space: ['ARKK', 'ARKX', 'UFO', 'RKLB', 'ASTS', 'LUNR'],
  innovation: ['ARKK', 'PLTR', 'TSLA', 'QBTS', 'RGTI', 'IONQ'],
  ai_infra: ['NVDA', 'AMD', 'AVGO', 'SMH', 'MSFT', 'GOOGL', 'AMZN'],
  semis: ['NVDA', 'AMD', 'AVGO', 'SMH', 'INTC'],
  energy: ['CCJ', 'URA', 'VST', 'CEG', 'SMR', 'OKLO', 'NUKZ'],
  quantum: ['QBTS', 'RGTI', 'IONQ', 'IBM', 'QTUM'],
  rates: ['TLT', 'SPY', 'QQQ', 'XLK', 'ARKK'],
  speculative: ['QBTS', 'RGTI', 'IONQ', 'PLTR', 'SMR', 'OKLO'],
};

export function parseBriefDate(value) {
  if (!value) return null;
  const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function daysUntilEvent(eventDate, nowMs = Date.now()) {
  const d = parseBriefDate(eventDate);
  if (!d) return null;
  return Math.ceil((d.getTime() - nowMs) / MS_DAY);
}

/**
 * @param {MacroEvent[]} [events]
 * @param {number} [nowMs]
 * @param {number} [horizonDays]
 */
export function getActiveMacroEvents(events = MACRO_EVENTS_JUNE_2026, nowMs = Date.now(), horizonDays = 21) {
  return events
    .filter((e) => {
      const days = daysUntilEvent(e.event_date, nowMs);
      if (days == null) return true;
      return days >= -7 && days <= horizonDays;
    })
    .sort((a, b) => {
      const da = daysUntilEvent(a.event_date, nowMs) ?? 999;
      const db = daysUntilEvent(b.event_date, nowMs) ?? 999;
      if (da !== db) return da - db;
      return (a.priority || 9) - (b.priority || 9);
    });
}

/**
 * @param {string} ticker
 * @param {MacroEvent[]} [events]
 */
export function getMacroEventsForTicker(ticker, events = MACRO_EVENTS_JUNE_2026, nowMs = Date.now()) {
  const t = String(ticker || '').toUpperCase();
  const active = getActiveMacroEvents(events, nowMs);
  return active.filter((e) => {
    if (e.affected_tickers?.includes(t)) return true;
    if (e.associated_tickers?.includes(t)) return true;
    for (const [theme, tickers] of Object.entries(THEME_TICKER_MAP)) {
      if (e.themes?.includes(theme) && tickers.includes(t)) return true;
    }
    return false;
  });
}

/**
 * Suggest a catalyst watch prefill from the nearest macro event for a ticker.
 * @param {string} ticker
 */
export function suggestCatalystFromMacro(ticker, nowMs = Date.now()) {
  const matches = getMacroEventsForTicker(ticker, getMacroEventCatalog(), nowMs);
  if (matches.length === 0) return null;
  const primary = matches[0];
  return {
    ticker: String(ticker).toUpperCase(),
    title: primary.title,
    event_date: primary.event_date,
    bias: primary.bias,
    associated_tickers: primary.associated_tickers || [],
    notes: `${primary.summary}\n\nPrep: ${(primary.investor_prep || []).join(' ')}`,
    soften_abort: primary.bias !== 'bearish',
    macro_event_id: primary.id,
  };
}

/**
 * @param {{ ticker: string, advisor_score?: number|null }[]} holdings
 */
export function getPortfolioMacroAlerts(holdings = [], nowMs = Date.now()) {
  const alerts = [];

  for (const h of holdings) {
    const events = getMacroEventsForTicker(h.ticker, getMacroEventCatalog(), nowMs);
    if (events.length === 0) continue;
    const nearest = events[0];
    const days = daysUntilEvent(nearest.event_date, nowMs);
    const weakTechnical = h.advisor_score != null && h.advisor_score < 35;
    alerts.push({
      ticker: h.ticker,
      advisor_score: h.advisor_score ?? null,
      events,
      nearest_event: nearest,
      days_until: days,
      tension: weakTechnical && nearest.bias !== 'bearish'
        ? 'technical_weak_macro_catalyst'
        : weakTechnical
          ? 'technical_weak'
          : 'macro_ahead',
    });
  }

  return alerts.sort((a, b) => (a.days_until ?? 99) - (b.days_until ?? 99));
}

/**
 * Enrich forward outlook with macro calendar when user has no catalyst watch.
 * @param {object} outlook from computeForwardOutlook
 * @param {string} ticker
 */
export function enrichOutlookWithMacro(outlook, ticker, nowMs = Date.now()) {
  const events = getMacroEventsForTicker(ticker, getMacroEventCatalog(), nowMs);
  if (events.length === 0) return { ...outlook, macro_events: [] };

  const nearest = events[0];
  const days = daysUntilEvent(nearest.event_date, nowMs);
  const macroHeadline = days != null && days <= 3
    ? `Macro: ${nearest.title} — ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}.`
    : `Macro: ${nearest.title} on horizon.`;

  const merged = { ...outlook, macro_events: events, macro_headline: macroHeadline };

  if (outlook.catalyst) return merged;

  if (outlook.technical_zone === 'abort' && nearest.bias === 'watch') {
    merged.headline = 'Technical weak — major macro event may re-rate this name.';
    merged.detail = `${nearest.summary} ${macroHeadline}`;
    merged.prep = [...(outlook.prep || []), ...(nearest.investor_prep || [])];
    merged.risks = [...(outlook.risks || []), ...(nearest.risks || [])];
    merged.verdict = days != null && days <= 5 ? 'MACRO_PREP_HOLD' : outlook.verdict;
    merged.suggested_catalyst = suggestCatalystFromMacro(ticker, nowMs);
  } else if (nearest.bias === 'bearish' && outlook.technical_zone !== 'keep') {
    merged.headline = 'Macro headwind aligns with soft technicals.';
    merged.detail = nearest.summary;
    merged.risks = [...(outlook.risks || []), ...(nearest.risks || [])];
    merged.verdict = 'MACRO_CAUTION';
  } else if (nearest.bias === 'bullish') {
    merged.prep = [...(outlook.prep || []), ...(nearest.investor_prep || [])];
    merged.detail = `${outlook.detail} ${nearest.summary}`;
    merged.suggested_catalyst = suggestCatalystFromMacro(ticker, nowMs);
  }

  return merged;
}

export function macroBriefNewsTickers(nowMs = Date.now()) {
  const active = getActiveMacroEvents(getMacroEventCatalog(), nowMs);
  const out = new Set(['SPY', 'QQQ', 'VIX']);
  for (const e of active) {
    for (const t of e.associated_tickers || []) out.add(t);
    for (const t of (e.affected_tickers || []).slice(0, 6)) out.add(t);
  }
  return [...out];
}

export function buildInvestorBrief(nowMs = Date.now()) {
  const active = getActiveMacroEvents(getMacroEventCatalog(), nowMs);
  return {
    as_of: MACRO_BRIEF_AS_OF,
    generated_at: nowMs,
    themes: [
      { id: 'space_ipo', label: 'SpaceX IPO week', detail: 'SPCX listing — sentiment read for innovation & space ETFs' },
      { id: 'fed_pivot', label: 'Warsh Fed debut', detail: 'First FOMC Jun 17 — tone > headline rate hold' },
      { id: 'ai_breadth', label: 'AI broadening', detail: 'Infra, power, semis gaining vs pure software narrative' },
      { id: 'sticky_cpi', label: 'Sticky inflation', detail: 'Hike odds rising — mind speculative sizing' },
    ],
    events: active.map((e) => ({
      ...e,
      days_until: daysUntilEvent(e.event_date, nowMs),
    })),
  };
}
