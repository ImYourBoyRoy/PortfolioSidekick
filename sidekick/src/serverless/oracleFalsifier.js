// ./sidekick/src/serverless/oracleFalsifier.js
/**
 * Automatic falsifier checks against live prices and conviction streaks.
 * Downgrades oracle stance when support breaks or multiple falsifiers fire.
 *
 * Created by: Roy Dawson IV
 */

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Machine-checkable falsifier rules derived from scenario oracle levels.
 */
export function buildFalsifierRules({ support, resistance, stop, advisorScore, weakSessionCount = 0 }) {
  const rules = [];
  if (Number.isFinite(support) && support > 0) {
    rules.push({
      id: 'support_break',
      scenario_id: 'base',
      type: 'price_below',
      threshold: support,
      label: `Daily close below $${round2(support)} (support break)`,
      severity: 'high',
    });
  }
  if (Number.isFinite(stop) && stop > 0) {
    rules.push({
      id: 'stop_zone',
      scenario_id: 'bear',
      type: 'price_below',
      threshold: stop,
      label: `Price breaks stop zone $${round2(stop)}`,
      severity: 'high',
    });
  }
  if (Number.isFinite(resistance) && resistance > 0) {
    rules.push({
      id: 'resistance_reclaim_fail',
      scenario_id: 'bull',
      type: 'price_below',
      threshold: resistance,
      label: `Fails to hold above $${round2(resistance)} after event`,
      severity: 'medium',
      requires_above_first: true,
    });
  }
  if (advisorScore != null && advisorScore < 35) {
    rules.push({
      id: 'weak_conviction_streak',
      scenario_id: 'base',
      type: 'conviction_streak',
      threshold: 5,
      current: weakSessionCount,
      label: `Conviction under 35 for ${weakSessionCount}/5 sessions without catalyst confirmation`,
      severity: 'medium',
    });
  }
  return rules;
}

/**
 * @param {object} input
 * @param {number|null} input.currentPrice
 * @param {object[]} input.rules
 * @param {number|null} [input.advisorScore]
 */
export function evaluateFalsifierRules(input) {
  const price = Number(input.currentPrice);
  const hasPrice = Number.isFinite(price) && price > 0;
  const triggered = [];
  const watching = [];

  for (const rule of input.rules || []) {
    if (rule.type === 'price_below' && hasPrice) {
      const fired = price < rule.threshold;
      const row = {
        ...rule,
        fired,
        current_price: price,
        checked_at: new Date().toISOString(),
      };
      if (fired) triggered.push(row);
      else watching.push(row);
    } else if (rule.type === 'conviction_streak') {
      const fired = (rule.current ?? 0) >= (rule.threshold ?? 5);
      const row = {
        ...rule,
        fired,
        checked_at: new Date().toISOString(),
      };
      if (fired) triggered.push(row);
      else watching.push(row);
    }
  }

  const highSeverity = triggered.filter((t) => t.severity === 'high').length;
  const totalFired = triggered.length;

  let stance_override = null;
  let confidence_penalty = 0;
  const messages = [];

  if (highSeverity >= 1 || totalFired >= 2) {
    stance_override = 'WAIT';
    confidence_penalty = totalFired >= 2 ? 22 : 15;
    messages.push(
      totalFired >= 2
        ? `${totalFired} falsifiers fired — Scenario Oracle downgraded to WAIT`
        : 'Critical falsifier fired — wait for price structure repair',
    );
  } else if (totalFired === 1) {
    confidence_penalty = 8;
    messages.push('One falsifier active — reduce size until cleared');
  }

  return {
    triggered,
    watching,
    fired_count: totalFired,
    stance_override,
    confidence_penalty,
    messages,
    auto_downgraded: stance_override === 'WAIT',
  };
}

/**
 * Merge falsifier evaluation into a built scenario oracle object.
 */
export function applyFalsifierOverlay(oracle, falsifierEval, regimeAdjust) {
  if (!oracle || oracle.oracle_stance === 'INSUFFICIENT_DATA') return oracle;

  const confidence = { ...oracle.confidence };
  let penalty = falsifierEval.confidence_penalty || 0;
  if (regimeAdjust?.penalty) penalty += regimeAdjust.penalty;

  if (penalty > 0) {
    confidence.score = Math.max(5, confidence.score - penalty);
    confidence.reasons = [
      ...confidence.reasons,
      ...(falsifierEval.messages || []),
      ...(regimeAdjust?.reasons || []),
    ];
    if (confidence.score < 45) {
      confidence.level = 'low';
      confidence.label = 'Low confidence — wait for clarity';
    } else if (confidence.score < 72) {
      confidence.level = 'medium';
      confidence.label = 'Moderate confidence';
    }
  }

  let oracle_stance = oracle.oracle_stance;
  let stance_summary = oracle.stance_summary;
  if (falsifierEval.stance_override) {
    oracle_stance = falsifierEval.stance_override;
    stance_summary = `${oracle.ticker}: falsifiers fired — Scenario Oracle says WAIT. `
      + `Repair levels before re-engaging. (${confidence.label}, ${confidence.score}/100)`;
  }

  const scenarios = (oracle.scenarios || []).map((sc) => ({
    ...sc,
    falsifier_status: (falsifierEval.triggered || [])
      .filter((t) => t.scenario_id === sc.id)
      .map((t) => ({ id: t.id, label: t.label, fired: true })),
  }));

  return {
    ...oracle,
    confidence,
    oracle_stance,
    stance_summary,
    scenarios,
    falsifier_eval: falsifierEval,
    regime_tag: regimeAdjust?.regime?.tag || null,
  };
}
