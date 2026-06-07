// ./frontend/src/serverless/guessAnalytics.js
/**
 * Oracle intuition analytics from resolved guess history only — no placeholder accuracy.
 * Created by: Roy Dawson IV
 */

function round1(n) {
  return Math.round(n * 10) / 10;
}

function accuracyForBucket(guesses) {
  if (!guesses?.length) return null;
  const hits = guesses.filter((g) => g.status === 'hit').length;
  return round1((hits / guesses.length) * 100);
}

/**
 * @param {{ completed?: object[], pending?: object[] }} guessData
 */
export function buildGuessAnalytics(guessData = {}) {
  const completed = guessData.completed || [];
  const pending = guessData.pending || [];
  const total = completed.length;

  if (total === 0) {
    return {
      has_data: false,
      overall_accuracy: null,
      completed_count: 0,
      pending_count: pending.length,
      archetype: 'Oracle Apprentice',
      archetype_desc: 'No resolved predictions yet. Submit price targets in Oracle Predictor to track your intuition.',
      details: { short_term: null, long_term: null },
    };
  }

  const hits = completed.filter((g) => g.status === 'hit').length;
  const overall = round1((hits / total) * 100);
  const shortTerm = completed.filter((g) => Number(g.timeframe_days) <= 15);
  const longTerm = completed.filter((g) => Number(g.timeframe_days) > 15);

  let archetype = 'Tactical Value Seeker';
  let archetype_desc = 'Analytics derived from your on-device resolved predictions.';
  const stAcc = accuracyForBucket(shortTerm);
  const ltAcc = accuracyForBucket(longTerm);

  if (overall > 65) {
    if (stAcc != null && ltAcc != null && stAcc > ltAcc) {
      archetype = 'Uptrend Swing Master';
      archetype_desc = 'Strong short-term prediction accuracy on 7–14 day horizons.';
    } else if (ltAcc != null) {
      archetype = 'Long-Term Macro Visionary';
      archetype_desc = 'Strong accuracy on multi-week and longer horizons.';
    }
  } else if (overall < 35) {
    archetype = 'Contrarian Indicator';
    archetype_desc = 'Low hit rate — consider weighing technical signals more heavily than gut targets.';
  }

  return {
    has_data: true,
    overall_accuracy: overall,
    completed_count: total,
    pending_count: pending.length,
    hit_predictions: hits,
    missed_predictions: total - hits,
    accuracy_rate: overall,
    archetype,
    archetype_desc,
    details: {
      short_term: stAcc,
      long_term: ltAcc,
    },
  };
}
