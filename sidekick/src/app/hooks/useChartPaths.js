// ./sidekick/src/app/hooks/useChartPaths.js
/**
 * Memoized SVG path geometry for the Coach chart.
 * Created by: Roy Dawson IV
 */
import { useMemo } from 'react';

export function useChartPaths(chartData, chartOverlays, indicatorSettings) {
  return useMemo(() => {
    if (!chartData || chartData.length === 0) return null;

    const width = 800;
    const height = 300;
    const padding = 40;

    const prices = chartData.map((d) => d.close_price);
    const minP = Math.min(...prices) * 0.98;
    const maxP = Math.max(...prices) * 1.02;

    const getX = (index) => padding + (index / (prices.length - 1)) * (width - padding * 2);
    const getY = (price) => height - padding - ((price - minP) / (maxP - minP)) * (height - padding * 2);

    let mainPath = '';
    prices.forEach((price, idx) => {
      const x = getX(idx);
      const y = getY(price);
      if (idx === 0) mainPath += `M ${x} ${y}`;
      else mainPath += ` L ${x} ${y}`;
    });

    const smaSpan = Math.max(2, Math.round(indicatorSettings.smaFast || 50));
    let sma50Path = '';
    if (chartOverlays.sma50 && prices.length >= smaSpan) {
      const smaValues = [];
      for (let i = 0; i < prices.length; i++) {
        if (i < smaSpan - 1) {
          smaValues.push(prices[i]);
        } else {
          const sum = prices.slice(i - (smaSpan - 1), i + 1).reduce((a, b) => a + b, 0);
          smaValues.push(sum / smaSpan);
        }
      }
      smaValues.forEach((val, idx) => {
        const x = getX(idx);
        const y = getY(val);
        if (idx === 0) sma50Path += `M ${x} ${y}`;
        else sma50Path += ` L ${x} ${y}`;
      });
    }

    const bbPeriodCfg = Math.max(2, Math.round(indicatorSettings.bbPeriod || 20));
    const bbStdCfg = indicatorSettings.bbStdDev || 2;
    let bbAreaPath = '';
    if (chartOverlays.bollinger && prices.length >= bbPeriodCfg) {
      const period = bbPeriodCfg;
      const bbUpper = [];
      const bbLower = [];
      for (let i = 0; i < prices.length; i++) {
        if (i < period - 1) {
          bbUpper.push(prices[i]);
          bbLower.push(prices[i]);
        } else {
          const slice = prices.slice(i - (period - 1), i + 1);
          const mean = slice.reduce((a, b) => a + b, 0) / period;
          const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
          const std = Math.sqrt(variance);
          bbUpper.push(mean + std * bbStdCfg);
          bbLower.push(mean - std * bbStdCfg);
        }
      }

      let upperPath = '';
      bbUpper.forEach((val, idx) => {
        const x = getX(idx);
        const y = getY(val);
        if (idx === 0) upperPath += `M ${x} ${y}`;
        else upperPath += ` L ${x} ${y}`;
      });

      let lowerPath = '';
      for (let idx = bbLower.length - 1; idx >= 0; idx--) {
        const x = getX(idx);
        const y = getY(bbLower[idx]);
        lowerPath += ` L ${x} ${y}`;
      }

      bbAreaPath = `${upperPath} ${lowerPath} Z`;
    }

    const simulatedMarkers = [];
    if (chartOverlays.signals && prices.length >= 14) {
      const rsiSeries = [];
      const period = 14;
      const deltas = [];
      for (let k = 0; k < prices.length - 1; k++) {
        deltas.push(prices[k + 1] - prices[k]);
      }

      for (let i = 0; i < prices.length; i++) {
        if (i < period) {
          rsiSeries.push(50.0);
        } else {
          const subsetDeltas = deltas.slice(i - period, i);
          const gains = subsetDeltas.filter((d) => d > 0);
          const losses = subsetDeltas.filter((d) => d < 0).map((d) => -d);
          const avgGain = gains.length > 0 ? (gains.reduce((a, b) => a + b, 0) / period) : 0;
          const avgLoss = losses.length > 0 ? (losses.reduce((a, b) => a + b, 0) / period) : 0;

          if (avgLoss === 0) rsiSeries.push(100.0);
          else {
            const rs = avgGain / avgLoss;
            rsiSeries.push(100.0 - (100.0 / (1.0 + rs)));
          }
        }
      }

      for (let idx = 14; idx < prices.length; idx += 12) {
        const rsiVal = rsiSeries[idx];
        if (rsiVal < 35) {
          simulatedMarkers.push({ type: 'buy', x: getX(idx), y: getY(prices[idx]) });
        } else if (rsiVal > 65) {
          simulatedMarkers.push({ type: 'sell', x: getX(idx), y: getY(prices[idx]) });
        }
      }
    }

    return {
      minP,
      maxP,
      getX,
      getY,
      mainPath,
      sma50Path,
      bbAreaPath,
      simulatedMarkers,
    };
  }, [chartData, chartOverlays, indicatorSettings]);
}
