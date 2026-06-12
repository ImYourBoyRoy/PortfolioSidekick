// ./sidekick/src/serverless/oracleFalsifier.test.js
import { describe, expect, it } from 'vitest';
import { buildFalsifierRules, evaluateFalsifierRules } from './oracleFalsifier.js';

describe('oracleFalsifier', () => {
  it('fires support break and downgrades stance', () => {
    const rules = buildFalsifierRules({
      support: 50,
      resistance: 60,
      stop: 45,
      advisorScore: 40,
      weakSessionCount: 0,
    });
    const evalResult = evaluateFalsifierRules({ currentPrice: 48, rules });
    expect(evalResult.fired_count).toBeGreaterThanOrEqual(1);
    expect(evalResult.triggered.some((t) => t.id === 'support_break')).toBe(true);
  });

  it('auto-downgrades when two falsifiers fire', () => {
    const rules = [
      { id: 'a', type: 'price_below', threshold: 50, severity: 'high', scenario_id: 'base' },
      { id: 'b', type: 'conviction_streak', threshold: 5, current: 5, severity: 'medium', scenario_id: 'base' },
    ];
    const evalResult = evaluateFalsifierRules({ currentPrice: 40, rules });
    expect(evalResult.stance_override).toBe('WAIT');
    expect(evalResult.auto_downgraded).toBe(true);
  });
});
