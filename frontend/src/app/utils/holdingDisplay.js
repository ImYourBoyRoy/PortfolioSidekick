// ./frontend/src/app/utils/holdingDisplay.js
/**
 * UI helpers for holdings with nullable advisor / P&L fields.
 */

export function isNonQuotableHolding(holding) {
  return holding?.non_quotable === true
    || holding?.quote_status === 'non_quotable'
    || holding?.quote_status === 'position_equity';
}

export function hasAdvisorScore(holding) {
  return holding
    && holding.advisor_score != null
    && !holding.advisor_unavailable
    && !holding.price_stale
    && !isNonQuotableHolding(holding);
}

export function isYahooFallbackMark(holding) {
  return String(holding?.price_source || '').includes('yahoo');
}

export function formatQuoteStatusLabel(holding) {
  if (holding?.quote_status === 'non_quotable') return 'Untradeable';
  if (holding?.quote_status === 'position_equity' || holding?.price_source === 'robinhood-position') {
    return 'RH position mark';
  }
  if (holding?.price_stale) return 'Pending quote';
  if (isYahooFallbackMark(holding)) return 'Yahoo fallback';
  return null;
}

export function formatAdvisorScore(holding, digits = 0) {
  if (!hasAdvisorScore(holding)) return '—';
  return `${holding.advisor_score.toFixed(digits)}%`;
}

export function formatAdvisorAction(holding) {
  if (!hasAdvisorScore(holding)) return 'Pending';
  const prefix = holding.advisor_is_estimate ? '~ ' : '';
  const action = holding.advisor_action || 'HOLD';
  if (action === 'BUY') return `${prefix}▲ BUY`;
  if (action === 'SELL') return `${prefix}▼ SELL`;
  return `${prefix}◆ HOLD`;
}

/** Normalize API advisor payloads for dashboard gauge components. */
export function normalizeAdvisorForUi(rec) {
  if (!rec || rec.insufficient_data) return null;
  const score = rec.score ?? rec.advisor_score;
  const action = rec.action ?? rec.advisor_action;
  if (score == null || !Number.isFinite(Number(score)) || !action) return null;
  return {
    action,
    score: Number(score),
    message: rec.message ?? null,
  };
}
