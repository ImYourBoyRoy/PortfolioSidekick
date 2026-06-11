// ./sidekick/src/serverless/catalystWatch.js
/**
 * Catalyst Watch — forward-looking event overlays on technical advisor zones.
 * Stores per-profile watches with associated tickers for news and prep context.
 *
 * Created by: Roy Dawson IV
 */

const MS_DAY = 86400000;
const PRE_EVENT_DAYS = 45;
const POST_EVENT_GRACE_DAYS = 14;

/** @typedef {'bullish'|'bearish'|'watch'} CatalystBias */

/**
 * @typedef {object} CatalystWatch
 * @property {string} id
 * @property {number} profile_id
 * @property {string} ticker
 * @property {string} title
 * @property {string|null} event_date ISO date YYYY-MM-DD
 * @property {CatalystBias} bias
 * @property {string[]} associated_tickers
 * @property {string} notes
 * @property {boolean} soften_abort
 * @property {string} created_at
 */

export function normalizeTickerList(raw) {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : String(raw).split(/[,\s]+/);
  return [...new Set(items.map((t) => String(t).toUpperCase().trim()).filter(Boolean))];
}

export function parseEventDate(value) {
  if (!value) return null;
  const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {CatalystWatch} catalyst
 * @param {number} [nowMs]
 */
export function getCatalystPhase(catalyst, nowMs = Date.now()) {
  const event = parseEventDate(catalyst.event_date);
  if (!event) return 'open'; // no fixed date — user-defined watch window

  const now = nowMs;
  const eventMs = event.getTime();
  const daysToEvent = Math.ceil((eventMs - now) / MS_DAY);

  if (daysToEvent > PRE_EVENT_DAYS) return 'distant';
  if (daysToEvent > 7) return 'upcoming';
  if (daysToEvent > 0) return 'imminent';
  if (daysToEvent >= -3) return 'event_week';
  if (daysToEvent >= -POST_EVENT_GRACE_DAYS) return 'post_event';
  return 'expired';
}

export function isCatalystActive(catalyst, nowMs = Date.now()) {
  const phase = getCatalystPhase(catalyst, nowMs);
  return phase !== 'expired' && phase !== 'distant';
}

/**
 * Technical zone from advisor conviction score.
 * @param {number|null} score
 */
export function technicalZoneFromScore(score) {
  if (score == null || !Number.isFinite(score)) return 'pending';
  if (score >= 65) return 'keep';
  if (score >= 35) return 'monitor';
  return 'abort';
}

/**
 * @param {CatalystWatch|null} catalyst
 * @param {string} technicalZone
 */
export function effectiveZoneFromCatalyst(catalyst, technicalZone) {
  if (!catalyst || !isCatalystActive(catalyst)) return technicalZone;
  if (technicalZone !== 'abort' || !catalyst.soften_abort) return technicalZone;
  if (catalyst.bias === 'bullish' || catalyst.bias === 'watch') return 'catalyst_hold';
  return technicalZone;
}

/**
 * @param {CatalystWatch} catalyst
 * @param {number} [nowMs]
 */
export function formatCatalystCountdown(catalyst, nowMs = Date.now()) {
  const event = parseEventDate(catalyst.event_date);
  if (!event) return 'Open watch — no fixed date';
  const days = Math.ceil((event.getTime() - nowMs) / MS_DAY);
  if (days > 1) return `${days} days until event`;
  if (days === 1) return 'Event tomorrow';
  if (days === 0) return 'Event today';
  if (days >= -3) return `${Math.abs(days)}d since event — confirmation window`;
  if (days >= -POST_EVENT_GRACE_DAYS) return `${Math.abs(days)}d post-event — review thesis`;
  return 'Event window closed';
}

/**
 * Forward prep verdict blending technicals + catalyst.
 * @param {{ advisor_score?: number|null, advisor_action?: string|null }} holding
 * @param {CatalystWatch|null} catalyst
 * @param {number} [nowMs]
 */
export function computeForwardOutlook(holding, catalyst, nowMs = Date.now()) {
  const score = holding.advisor_score;
  const technical = technicalZoneFromScore(score);
  const effective = effectiveZoneFromCatalyst(catalyst, technical);
  const phase = catalyst ? getCatalystPhase(catalyst, nowMs) : null;

  let verdict = 'TECHNICAL_ONLY';
  let headline = 'Technical conviction drives the call.';
  let detail = 'No catalyst watch on this symbol — scores reflect current price action only.';
  const risks = [];
  const prep = [];

  if (!catalyst || !isCatalystActive(catalyst)) {
    if (technical === 'abort') {
      verdict = 'REDUCE';
      headline = 'Technical weakness — consider trimming or rotating.';
      detail = 'No active catalyst override. Abort zone reflects weak multi-indicator conviction.';
    } else if (technical === 'monitor') {
      verdict = 'MONITOR';
      headline = 'Hold and watch — neither strong nor broken.';
    } else if (technical === 'keep') {
      verdict = 'MAINTAIN';
      headline = 'Technical strength supports maintaining exposure.';
    }
    return {
      verdict,
      headline,
      detail,
      technical_zone: technical,
      effective_zone: effective,
      catalyst_phase: phase,
      countdown: null,
      risks,
      prep,
      forward_score_hint: score,
    };
  }

  const assoc = (catalyst.associated_tickers || []).join(', ');
  const countdown = formatCatalystCountdown(catalyst, nowMs);

  if (catalyst.bias === 'bullish') {
    if (technical === 'abort' && effective === 'catalyst_hold') {
      verdict = phase === 'imminent' || phase === 'event_week' ? 'HOLD_THROUGH_EVENT' : 'PREPARE_ADD';
      headline = phase === 'imminent' || phase === 'event_week'
        ? 'Technical weak — catalyst window says hold through the event.'
        : 'Technical weak — bullish catalyst ahead; prep positions, don\'t chase blindly.';
      detail = `${catalyst.title}. Associated: ${assoc || '—'}. ${countdown}.`;
      prep.push('Define max add size before the event — avoid FOMO sizing.');
      prep.push('Set a post-event review date to re-check conviction scores.');
      risks.push('Gap risk around the catalyst — technicals may stay weak until price confirms.');
    } else if (technical === 'keep' || technical === 'monitor') {
      verdict = 'ADD_ON_CONFIRM';
      headline = 'Catalyst aligns with improving/neutral technicals — favorable setup.';
      detail = `${catalyst.title}. ${countdown}.`;
      prep.push('Scale in on strength after associated names move (e.g. headline tickers).');
    }
  } else if (catalyst.bias === 'bearish') {
    verdict = 'REDUCE_AHEAD';
    headline = 'Bearish catalyst ahead — technicals and event risk align.';
    detail = `${catalyst.title}. ${countdown}.`;
    prep.push('Consider hedging or trimming before the event date.');
    risks.push('Event may accelerate downside even if short-term technicals look OK.');
  } else {
    // watch / uncertain
    verdict = effective === 'catalyst_hold' ? 'WAIT_AND_SEE' : 'MONITOR_CATALYST';
    headline = 'Uncertain catalyst — technicals alone are inconclusive.';
    detail = `${catalyst.title}. Could go either way. ${countdown}.`;
    prep.push('Watch associated tickers in News for confirmation of direction.');
    prep.push('Avoid full-size bets until post-event price action confirms.');
    risks.push('High variance — "maybe great buy, maybe not" is exactly this profile.');
  }

  if (phase === 'post_event') {
    verdict = 'REVIEW_THESIS';
    headline = 'Post-event window — re-score before the next move.';
    detail = 'Catalyst date passed. Use fresh advisor conviction before adding or cutting.';
    prep.push('Compare pre- vs post-event conviction on Coach Chart.');
  }

  const forwardHint = score != null && catalyst.bias === 'bullish' && effective === 'catalyst_hold'
    ? Math.min(55, Math.round((score + 18) * 10) / 10)
    : score;

  return {
    verdict,
    headline,
    detail,
    technical_zone: technical,
    effective_zone: effective,
    catalyst_phase: phase,
    countdown,
    risks,
    prep,
    forward_score_hint: forwardHint,
    catalyst,
  };
}

/**
 * @param {CatalystWatch[]} watches
 * @param {string} ticker
 */
export function findCatalystForTicker(watches, ticker) {
  const t = String(ticker || '').toUpperCase();
  return watches.find((c) => String(c.ticker).toUpperCase() === t && isCatalystActive(c)) || null;
}

/**
 * Collect all tickers to enrich news/search from active catalysts.
 * @param {CatalystWatch[]} watches
 */
export function catalystNewsTickers(watches) {
  const out = new Set();
  for (const c of watches) {
    if (!isCatalystActive(c)) continue;
    out.add(String(c.ticker).toUpperCase());
    for (const a of c.associated_tickers || []) out.add(String(a).toUpperCase());
  }
  return [...out];
}

export function createCatalystId() {
  return `cat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
