// ./sidekick/src/serverless/oracleScorecard.js
/**
 * Post-event scenario scorecards — snapshot oracle stances and grade outcomes.
 * Portable JSON in app_settings (SQLite) for cross-platform use.
 *
 * Created by: Roy Dawson IV
 */

const MS_DAY = 86400000;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function parseDate(d) {
  if (!d) return null;
  const t = new Date(`${d}T12:00:00Z`).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * @param {object} oracle built scenario oracle
 * @param {object} [forwardOutlook]
 */
export function createOracleSnapshot(oracle, forwardOutlook = {}) {
  const event = forwardOutlook.macro_events?.[0] || forwardOutlook.catalyst;
  return {
    id: `snap_${oracle.ticker}_${Date.now()}`,
    ticker: oracle.ticker,
    created_at: new Date().toISOString(),
    review_date: event?.event_date || null,
    event_title: event?.title || null,
    event_id: event?.id || null,
    oracle_stance: oracle.oracle_stance,
    confidence_score: oracle.confidence?.score ?? null,
    entry_price: oracle.current_price ?? null,
    scenarios: (oracle.scenarios || []).map((s) => ({
      id: s.id,
      label: s.label,
      price_range: s.price_range,
      likelihood_band: s.likelihood_band,
    })),
    horizon: oracle.horizon || 'week',
  };
}

export function shouldCreateSnapshot(existing, ticker, eventDate) {
  const list = existing || [];
  const recent = list.filter((s) => s.ticker === ticker && s.status === 'open');
  if (recent.length === 0) return true;
  if (!eventDate) return false;
  const hasEventSnap = recent.some((s) => s.review_date === eventDate);
  return !hasEventSnap;
}

/**
 * Grade which scenario path best matches post-event price.
 */
export function gradeSnapshotOutcome(snapshot, currentPrice) {
  const price = Number(currentPrice);
  if (!Number.isFinite(price) || price <= 0 || !snapshot?.entry_price) {
    return { status: 'pending', winner: null, note: 'Awaiting live quote' };
  }

  const entry = Number(snapshot.entry_price);
  const changePct = ((price - entry) / entry) * 100;
  let winner = 'base';
  let note = 'Price stayed inside base-case volatility band';

  for (const sc of snapshot.scenarios || []) {
    const [lo, hi] = sc.price_range || [];
    if (lo != null && hi != null && price >= lo && price <= hi) {
      winner = sc.id;
      note = `${sc.label} range ($${round2(lo)}–$${round2(hi)}) best describes outcome`;
      break;
    }
  }

  if (changePct <= -4) {
    winner = 'bear';
    note = `Down ${round2(changePct)}% from snapshot — risk-off path dominated`;
  } else if (changePct >= 4) {
    winner = 'bull';
    note = `Up ${round2(changePct)}% from snapshot — catalyst upside path dominated`;
  }

  const stanceMatch =
    (winner === 'bull' && ['PREP_NOT_CHASE', 'ACCUMULATE_ON_PULLBACK', 'TWO_WAY_EVENT'].includes(snapshot.oracle_stance))
    || (winner === 'bear' && ['REDUCE_OR_ROTATE', 'WAIT'].includes(snapshot.oracle_stance))
    || (winner === 'base' && ['MONITOR', 'TWO_WAY_EVENT'].includes(snapshot.oracle_stance));

  return {
    status: 'graded',
    winner,
    change_pct: round2(changePct),
    exit_price: price,
    stance_match: stanceMatch,
    note,
    graded_at: new Date().toISOString(),
  };
}

/**
 * Open snapshots past review_date become scorecards.
 * @param {object[]} snapshots
 * @param {Record<string, number>} livePrices ticker -> price
 */
export function processDueScorecards(snapshots, livePrices = {}) {
  const now = Date.now();
  const updated = [];
  const newCards = [];

  for (const snap of snapshots || []) {
    if (snap.status !== 'open') {
      updated.push(snap);
      continue;
    }
    const reviewAt = parseDate(snap.review_date);
    const due = reviewAt != null && now >= reviewAt + MS_DAY;
    if (!due) {
      updated.push(snap);
      continue;
    }
    const grade = gradeSnapshotOutcome(snap, livePrices[snap.ticker]);
    const closed = {
      ...snap,
      status: 'closed',
      outcome: grade,
    };
    updated.push(closed);
    newCards.push({
      id: `card_${snap.id}`,
      snapshot_id: snap.id,
      ticker: snap.ticker,
      event_title: snap.event_title,
      review_date: snap.review_date,
      oracle_stance: snap.oracle_stance,
      entry_price: snap.entry_price,
      ...grade,
    });
  }

  return { snapshots: updated, scorecards: newCards };
}
