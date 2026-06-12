// ./sidekick/src/serverless/guessAnalytics.test.js
import { describe, expect, it } from 'vitest';
import { buildGuessAnalytics } from './guessAnalytics.js';

describe('buildGuessAnalytics', () => {
  it('returns empty-state analytics without guesses', () => {
    const result = buildGuessAnalytics({ pending: [], completed: [] });
    expect(result.has_data).toBe(false);
    expect(result.completed_count).toBe(0);
  });

  it('computes hit rate from completed guesses', () => {
    const result = buildGuessAnalytics({
      pending: [],
      completed: [
        { status: 'hit', ticker: 'NVDA' },
        { status: 'missed', ticker: 'AMD' },
        { status: 'hit', ticker: 'AAPL' },
      ],
    });
    expect(result.completed_count).toBe(3);
    expect(result.hit_predictions).toBe(2);
    expect(result.overall_accuracy).toBeGreaterThan(60);
  });
});
