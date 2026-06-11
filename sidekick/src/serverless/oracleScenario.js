// ./sidekick/src/serverless/oracleScenario.js
/**
 * Scenario Oracle — range-based forward views with confidence grades and falsifiers.
 * Scenarios, not prophecies: always shows what would prove each thesis wrong.
 *
 * Created by: Roy Dawson IV
 */

function round2(n) {
  return Math.round(n * 100) / 100;
}

function pctBand(low, high) {
  return `${Math.round(low)}–${Math.round(high)}%`;
}

/**
 * @param {object} input
 * @param {string} input.ticker
 * @param {number|null} input.currentPrice
 * @param {number|null} input.advisorScore
 * @param {object|null} input.viability day/week/month from generateViabilityForecast
 * @param {object|null} input.forwardOutlook from enrichOutlookWithMacro
 * @param {object|null} input.guessAnalytics from buildGuessAnalytics
 * @param {boolean} [input.priceStale]
 * @param {object|null} [input.regime] from fetchLiveMarketRegime
 */
export function buildScenarioOracle(input) {
  const ticker = String(input.ticker || '').toUpperCase();
  const price = Number(input.currentPrice);
  const hasPrice = Number.isFinite(price) && price > 0;
  const horizon = input.horizon || 'week';
  const forecast = input.viability?.[horizon] || input.viability?.week || null;
  const atr = forecast?.atr > 0 ? forecast.atr : (hasPrice ? price * 0.04 : 0);
  const advisor = input.advisorScore;
  const outlook = input.forwardOutlook || {};
  const analytics = input.guessAnalytics;

  const signalAgreement = scoreSignalAgreement(advisor, outlook, forecast);
  const regime = input.regime || null;
  const confidence = gradeConfidence({
    hasPrice,
    priceStale: input.priceStale === true,
    hasForecast: Boolean(forecast),
    signalAgreement,
    guessSample: analytics?.completed_count ?? 0,
    guessAccuracy: analytics?.overall_accuracy,
    hasMacro: (outlook.macro_events || []).length > 0,
    hasCatalyst: Boolean(outlook.catalyst),
    conflict: outlook.verdict === 'MACRO_PREP_HOLD' || outlook.effective_zone === 'catalyst_hold',
    regime,
  });

  if (!hasPrice) {
    return {
      ticker,
      horizon,
      confidence,
      scenarios: [],
      oracle_stance: 'INSUFFICIENT_DATA',
      stance_summary: 'Live quote required before the Scenario Oracle can publish ranges.',
      review_triggers: [],
    };
  }

  const stop = forecast?.stop_loss ?? round2(price - atr * 2);
  const target = forecast?.exit_target ?? round2(price + atr * 2.5);
  const support = forecast?.support ?? round2(price - atr * 1.5);
  const resistance = forecast?.resistance ?? round2(price + atr * 1.5);

  const scenarios = [];

  // Base — continuation / mean path
  scenarios.push({
    id: 'base',
    label: 'Base case',
    likelihood_band: confidence.level === 'high' ? pctBand(40, 55) : pctBand(30, 50),
    price_range: [round2(price - atr), round2(price + atr)],
    time_horizon: horizonLabel(horizon),
    thesis: baseThesis(advisor, forecast, outlook),
    falsifiers: [
      `Daily close below $${support} (support break)`,
      `Conviction stays under 35 for 5+ sessions without catalyst confirmation`,
      outlook.macro_events?.[0]
        ? `${outlook.macro_events[0].title} disappoints vs sentiment`
        : 'No macro lift — weakness persists into next week',
    ],
  });

  // Bull — catalyst / technical repair
  const bullEnabled = outlook.verdict?.includes('MACRO') || outlook.verdict?.includes('PREP')
    || (advisor != null && advisor >= 45) || outlook.catalyst?.bias === 'bullish';
  if (bullEnabled || outlook.macro_events?.length) {
    scenarios.push({
      id: 'bull',
      label: 'Catalyst upside',
      likelihood_band: outlook.verdict === 'MACRO_PREP_HOLD' ? pctBand(25, 40) : pctBand(15, 30),
      price_range: [round2(price), round2(Math.max(target, price + atr * 2))],
      time_horizon: horizonLabel(horizon),
      thesis: bullThesis(outlook, ticker),
      falsifiers: [
        `Fails to reclaim $${resistance} after event`,
        'Associated tickers fade while this name lags (relative weakness)',
        'Volume spike on up-day without follow-through within 3 sessions',
      ],
    });
  }

  // Bear — macro + technical alignment
  const bearEnabled = (advisor != null && advisor < 35)
    || outlook.verdict === 'MACRO_CAUTION'
    || outlook.catalyst?.bias === 'bearish';
  if (bearEnabled) {
    scenarios.push({
      id: 'bear',
      label: 'Risk-off path',
      likelihood_band: advisor != null && advisor < 35 ? pctBand(25, 45) : pctBand(15, 25),
      price_range: [round2(Math.min(stop, price - atr * 2)), round2(price - atr * 0.5)],
      time_horizon: horizonLabel(horizon),
      thesis: bearThesis(advisor, outlook),
      falsifiers: [
        `Reclaims $${round2(price + atr * 0.5)} with expanding volume`,
        'Macro headline risk passes without follow-through selling',
        'Sector peers rally — isolation suggests stock-specific, not macro',
      ],
    });
  }

  const oracle_stance = deriveStance(confidence, outlook, advisor, scenarios);
  const stance_summary = stanceCopy(oracle_stance, ticker, confidence);

  const levels = { support, resistance, stop, target };

  return {
    ticker,
    horizon,
    current_price: price,
    confidence,
    signal_agreement: signalAgreement,
    scenarios,
    oracle_stance,
    stance_summary,
    review_triggers: buildReviewTriggers(outlook, horizon),
    levels,
    regime_tag: regime?.tag || null,
    disclaimer:
      'Scenario Oracle publishes ranges and likelihood bands — not certainties. '
      + 'Commit guesses in Intuition Tracker to calibrate trust over time.',
  };
}

function horizonLabel(h) {
  if (h === 'day') return '1–5 sessions';
  if (h === 'month') return '4–8 weeks';
  return '1–3 weeks';
}

function scoreSignalAgreement(advisor, outlook, forecast) {
  let agree = 0;
  let total = 0;
  const tech = outlook.technical_zone;
  if (advisor != null) {
    total += 1;
    if (advisor >= 65 && tech === 'keep') agree += 1;
    else if (advisor >= 35 && advisor < 65 && tech === 'monitor') agree += 1;
    else if (advisor < 35 && tech === 'abort') agree += 1;
  }
  if (forecast?.score != null && advisor != null) {
    total += 1;
    if (Math.abs(forecast.score - advisor) < 20) agree += 1;
  }
  if (outlook.catalyst && outlook.effective_zone === 'catalyst_hold') {
    total += 1;
    if (outlook.catalyst.bias === 'watch' || outlook.catalyst.bias === 'bullish') agree += 0.5;
  }
  if (total === 0) return null;
  return Math.round((agree / total) * 100);
}

function gradeConfidence(ctx) {
  const reasons = [];
  let score = 70;

  if (!ctx.hasPrice) {
    return { level: 'none', score: 0, reasons: ['No live quote'], label: 'No data' };
  }
  if (ctx.priceStale) {
    score -= 25;
    reasons.push('Stale quote — refresh sync first');
  }
  if (!ctx.hasForecast) {
    score -= 15;
    reasons.push('Limited history for horizon model');
  }
  if (ctx.signalAgreement != null && ctx.signalAgreement < 50) {
    score -= 20;
    reasons.push('Technical, macro, and catalyst signals conflict');
  } else if (ctx.signalAgreement >= 75) {
    score += 10;
    reasons.push('Signals largely agree');
  }
  if (ctx.conflict) {
    score -= 15;
    reasons.push('Tape weak but catalyst/macro may override — high variance');
  }
  if (ctx.hasMacro) {
    score -= 5;
    reasons.push('Macro event week — binary risk elevated');
  }
  if (ctx.guessSample >= 5 && ctx.guessAccuracy != null) {
    if (ctx.guessAccuracy >= 55) {
      score += 8;
      reasons.push(`Your guess calibration: ${ctx.guessAccuracy}% hit rate`);
    } else if (ctx.guessAccuracy < 40) {
      score -= 8;
      reasons.push(`Your guess calibration: ${ctx.guessAccuracy}% — weigh scenarios over gut`);
    }
  } else {
    reasons.push('Oracle calibration thin — submit guesses to build trust score');
  }
  if (ctx.regime && !ctx.regime.regime_is_estimate) {
    if (ctx.regime.regime === 'BEARISH' || ctx.regime.regime === 'CAUTIOUS') {
      score -= ctx.regime.regime === 'BEARISH' ? 10 : 6;
      reasons.push(ctx.regime.tag || 'Risk-off regime — catalyst trades need tighter falsifiers');
    } else if (ctx.regime.regime === 'BULLISH') {
      score += 4;
      reasons.push('Broad risk-on regime supports base-case follow-through');
    }
  }

  score = Math.max(5, Math.min(95, score));
  let level = 'medium';
  let label = 'Moderate confidence';
  if (score >= 72) {
    level = 'high';
    label = 'Higher confidence';
  } else if (score < 45) {
    level = 'low';
    label = 'Low confidence — wait for clarity';
  }

  return { level, score, reasons, label };
}

function baseThesis(advisor, forecast, outlook) {
  const parts = [];
  if (forecast?.action) parts.push(`Horizon model: ${forecast.action}`);
  if (advisor != null) parts.push(`Portfolio conviction ${Math.round(advisor)}`);
  if (outlook.macro_headline) parts.push(outlook.macro_headline);
  return parts.join(' · ') || 'Price oscillates inside recent volatility band.';
}

function bullThesis(outlook, ticker) {
  if (outlook.catalyst?.title) {
    return `${outlook.catalyst.title} lifts ${ticker} via sympathy / sentiment — size small until confirmation.`;
  }
  if (outlook.macro_events?.[0]) {
    return `${outlook.macro_events[0].title} — market re-rates innovation basket higher.`;
  }
  return 'Technical repair + sector tailwind produce a relief rally.';
}

function bearThesis(advisor, outlook) {
  if (outlook.verdict === 'MACRO_CAUTION') {
    return 'Macro headwind and soft technicals align — de-risk into events.';
  }
  if (advisor != null && advisor < 35) {
    return `Weak conviction (${Math.round(advisor)}) — distribution more likely than accumulation.`;
  }
  return 'Failed bounce — lower highs into next support zone.';
}

function deriveStance(confidence, outlook, advisor, scenarios) {
  if (confidence.level === 'none') return 'INSUFFICIENT_DATA';
  if (confidence.level === 'low') return 'WAIT';
  if (outlook.verdict === 'MACRO_PREP_HOLD' || outlook.effective_zone === 'catalyst_hold') {
    return 'PREP_NOT_CHASE';
  }
  if (advisor != null && advisor >= 65) return 'ACCUMULATE_ON_PULLBACK';
  if (advisor != null && advisor < 35 && !outlook.catalyst) return 'REDUCE_OR_ROTATE';
  if (scenarios.some((s) => s.id === 'bull') && scenarios.some((s) => s.id === 'bear')) {
    return 'TWO_WAY_EVENT';
  }
  return 'MONITOR';
}

function stanceCopy(stance, ticker, confidence) {
  const map = {
    WAIT: `${ticker}: signals conflict or data is thin — Scenario Oracle says wait, don't force a trade.`,
    PREP_NOT_CHASE: `${ticker}: technically soft but a catalyst window is active — prep size, don't FOMO the open.`,
    ACCUMULATE_ON_PULLBACK: `${ticker}: strength intact — add on dips inside the base-case range, not breakouts after extended runs.`,
    REDUCE_OR_ROTATE: `${ticker}: weak conviction without a catalyst override — favor rotation into stronger names.`,
    TWO_WAY_EVENT: `${ticker}: binary week — both upside and risk-off paths are live. Use smaller size and pre-defined falsifiers.`,
    MONITOR: `${ticker}: no edge strong enough to act — track falsifiers and re-run after next sync.`,
    INSUFFICIENT_DATA: 'Refresh quotes before acting on Oracle output.',
  };
  const base = map[stance] || map.MONITOR;
  return `${base} (${confidence.label}, ${confidence.score}/100)`;
}

function buildReviewTriggers(outlook, horizon) {
  const triggers = [];
  if (outlook.macro_events?.[0]?.event_date) {
    triggers.push(`Re-score ${outlook.macro_events[0].event_date} (macro event)`);
  }
  if (outlook.catalyst?.event_date) {
    triggers.push(`Review catalyst thesis on ${outlook.catalyst.event_date}`);
  }
  triggers.push(`Auto review in ${horizon === 'day' ? '3' : horizon === 'month' ? '30' : '14'} days`);
  triggers.push('If two falsifiers fire, downgrade stance to WAIT');
  return triggers;
}
