// ./sidekick/src/serverless/strength.js
/**
 * Portfolio Sidekick Serverless Market Strength Engine
 * Calculates relative strength and returns for 35 curated tickers.
 * Provides identical offline/serverless calculation parity for instantaneous UI rendering.
 *
 * Created by: Roy Dawson IV
 */

import { fetchYahooDaySnapshot } from './yahooQuotes.js';

// Master 35 Ticker Universe
const ASSET_UNIVERSE = [
  // Technology
  { ticker: "AAPL", name: "Apple Inc.", basePrice: 185.50, sectors: ["technology"] },
  { ticker: "MSFT", name: "Microsoft Corp.", basePrice: 420.20, sectors: ["technology", "quantum"] },
  { ticker: "NVDA", name: "NVIDIA Corp.", basePrice: 920.00, sectors: ["technology"] },
  { ticker: "GOOGL", name: "Alphabet Inc.", basePrice: 172.40, sectors: ["technology", "quantum"] },
  { ticker: "AMZN", name: "Amazon.com Inc.", basePrice: 180.10, sectors: ["technology", "quantum"] },
  { ticker: "META", name: "Meta Platforms", basePrice: 475.30, sectors: ["technology"] },
  { ticker: "TSLA", name: "Tesla Inc.", basePrice: 175.20, sectors: ["technology"] },
  { ticker: "AMD", name: "Advanced Micro Devices", basePrice: 160.40, sectors: ["technology"] },
  { ticker: "AVGO", name: "Broadcom Inc.", basePrice: 1400.00, sectors: ["technology"] },
  { ticker: "NFLX", name: "Netflix Inc.", basePrice: 610.50, sectors: ["technology"] },

  // Quantum Technology
  { ticker: "QBTS", name: "D-Wave Quantum", basePrice: 1.25, sectors: ["quantum"] },
  { ticker: "RGTI", name: "Rigetti Computing", basePrice: 1.15, sectors: ["quantum"] },
  { ticker: "IONQ", name: "IonQ Inc.", basePrice: 8.40, sectors: ["quantum"] },
  { ticker: "IBM", name: "IBM Corp.", basePrice: 168.90, sectors: ["quantum"] },
  { ticker: "PLTR", name: "Palantir Technologies", basePrice: 22.80, sectors: ["technology", "quantum"] },
  { ticker: "QTUM", name: "Defiance Quantum ETF", basePrice: 54.10, sectors: ["quantum", "etf"] },
  { ticker: "HON", name: "Honeywell International", basePrice: 198.50, sectors: ["quantum"] },

  // Energy / Nuclear
  { ticker: "CCJ", name: "Cameco Corp.", basePrice: 48.20, sectors: ["energy"] },
  { ticker: "SMR", name: "NuScale Power", basePrice: 6.80, sectors: ["energy"] },
  { ticker: "URA", name: "Global X Uranium ETF", basePrice: 28.50, sectors: ["energy", "etf"] },
  { ticker: "VST", name: "Vistra Corp.", basePrice: 82.30, sectors: ["energy"] },
  { ticker: "CEG", name: "Constellation Energy", basePrice: 215.40, sectors: ["energy"] },
  { ticker: "D", name: "Dominion Energy", basePrice: 52.80, sectors: ["energy"] },
  { ticker: "SO", name: "Southern Co.", basePrice: 74.20, sectors: ["energy"] },
  { ticker: "NEE", name: "NextEra Energy", basePrice: 68.90, sectors: ["energy"] },
  { ticker: "OKLO", name: "Oklo Inc.", basePrice: 12.50, sectors: ["energy"] },
  { ticker: "GE", name: "General Electric", basePrice: 155.60, sectors: ["energy"] },

  // ETFs / Large Cap Diversified
  { ticker: "SPY", name: "SPDR S&P 500 ETF", basePrice: 520.50, sectors: ["etf"] },
  { ticker: "QQQ", name: "Invesco QQQ ETF", basePrice: 440.30, sectors: ["etf"] },
  { ticker: "DIA", name: "SPDR Dow Jones Industrial", basePrice: 390.10, sectors: ["etf"] },
  { ticker: "IWM", "name": "iShares Russell 2000 ETF", basePrice: 202.40, sectors: ["etf"] },
  { ticker: "VOO", name: "Vanguard S&P 500 ETF", basePrice: 478.20, sectors: ["etf"] },
  { ticker: "SCHD", name: "Schwab US Dividend Equity", basePrice: 78.40, sectors: ["etf"] },
  { ticker: "ARKK", name: "ARK Innovation ETF", basePrice: 44.50, sectors: ["etf"] },
  { ticker: "ARKX", name: "ARK Space Exploration ETF", basePrice: 22.40, sectors: ["etf", "technology"] },
  { ticker: "UFO", name: "Procure Space ETF", basePrice: 28.30, sectors: ["etf", "technology"] },
  { ticker: "RKLB", name: "Rocket Lab USA", basePrice: 24.80, sectors: ["technology"] },
  { ticker: "SMH", name: "VanEck Semiconductor ETF", basePrice: 224.80, sectors: ["etf", "technology"] },
  { ticker: "XLK", name: "Technology Select Sector SPDR", basePrice: 204.60, sectors: ["etf", "technology"] }
];

/**
 * Stable seeded hash utility mirroring the Python MD5 implementation behaviors.
 */
const _seededHashValue = (ticker, timeframe, salt = "") => {
  const currentHourEpoch = Math.floor(Date.now() / 3600000);
  const currentDayEpoch = Math.floor(Date.now() / 86400000);
  const epoch = timeframe === "day" ? currentHourEpoch : currentDayEpoch;
  const key = `${ticker}_${timeframe}_${epoch}_${salt}`;
  
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  
  const maxInt = 2147483647;
  const val = Math.abs(hash) / maxInt;
  const sign = hash < 0 ? -1 : 1;
  const res = sign * (val * 2 - 1);
  return Math.max(-1.0, Math.min(1.0, res));
};

/**
 * Computes and ranks market returns instantly serverless/offline.
 */
export const calculateMarketStrength = (timeframe = "day", sector = "all") => {
  const tf = timeframe.toLowerCase().trim();
  const sec = sector.toLowerCase().trim();
  
  const volMultipliers = {
    day: 2.5,
    week: 6.5,
    month: 12.0,
    year: 45.0,
    "5years": 280.0
  };
  
  const volPct = volMultipliers[tf] || 2.5;
  const scoredAssets = [];
  
  for (const asset of ASSET_UNIVERSE) {
    if (sec !== "all" && !asset.sectors.includes(sec)) {
      continue;
    }
    
    const isQuantum = asset.sectors.includes("quantum");
    const isTech = asset.sectors.includes("technology");
    const isEtf = asset.sectors.includes("etf") && asset.sectors.length === 1;
    
    let vScaler = 1.0;
    if (isQuantum) {
      vScaler = 2.8;
    } else if (isTech) {
      vScaler = 1.4;
    } else if (isEtf) {
      vScaler = 0.5;
    }
    
    const seedFactor = _seededHashValue(asset.ticker, tf);
    const drift = isTech ? 0.15 : (isQuantum ? 0.05 : 0.08);
    
    let changePct = seedFactor * (volPct * vScaler) + drift;
    const maxLimit = volPct * vScaler * 1.5;
    changePct = Math.max(-maxLimit, Math.min(maxLimit, changePct));
    
    const priceFactor = tf !== "5years" ? 1.0 + (changePct / 100.0) : 1.0 + (changePct / 50.0);
    const currentPrice = Math.max(0.1, Math.round(asset.basePrice * priceFactor * 100) / 100);
    
    const scoreBase = 50.0 + (changePct / maxLimit) * 45.0;
    const techHash = _seededHashValue(asset.ticker, "technical_dna_score") * 5.0;
    const advisorScore = Math.max(10.0, Math.min(99.0, Math.round((scoreBase + techHash) * 10) / 10));
    
    let verdict = "MONITOR";
    if (advisorScore >= 65) {
      verdict = "KEEP";
    } else if (advisorScore < 35) {
      verdict = "ABORT";
    }
    
    scoredAssets.push({
      ticker: asset.ticker,
      name: asset.name,
      price: currentPrice,
      change_pct: Math.round(changePct * 100) / 100,
      score: advisorScore,
      verdict: verdict,
      sectors: asset.sectors
    });
  }
  
  const gainersSorted = [...scoredAssets].sort((a, b) => b.change_pct - a.change_pct);
  const declinersSorted = [...scoredAssets].sort((a, b) => a.change_pct - b.change_pct);
  
  return {
    timeframe: tf,
    sector: sec,
    data_synthetic: true,
    disclaimer: 'Simulated strength deck — not live market data. Use for exploration only.',
    all_assets: scoredAssets,
    top_gainers: gainersSorted.slice(0, 15),
    worst_decliners: declinersSorted.slice(0, 15),
  };
};

const WISE_TIMEFRAME_WEIGHTS = { day: 0.45, week: 0.35, month: 0.2 };

/**
 * Ranks cross-timeframe conviction picks for reallocation suggestions (excludes owned tickers).
 * @param {number} limit
 * @param {string[]} excludeTickers
 */
export const computeWisestReallocationPicks = (limit = 5, excludeTickers = []) => {
  const exclude = new Set(excludeTickers.map((t) => String(t).toUpperCase()));
  const composite = new Map();

  for (const [tf, weight] of Object.entries(WISE_TIMEFRAME_WEIGHTS)) {
    const deck = calculateMarketStrength(tf, 'all');
    for (const asset of deck.all_assets || []) {
      const ticker = asset.ticker.toUpperCase();
      if (exclude.has(ticker)) continue;
      const entry = composite.get(ticker) || {
        ticker,
        name: asset.name,
        composite_score: 0,
        day_pct: null,
        week_pct: null,
        month_pct: null,
        verdict: asset.verdict,
      };
      entry.composite_score += asset.score * weight;
      if (tf === 'day') entry.day_pct = asset.change_pct;
      if (tf === 'week') entry.week_pct = asset.change_pct;
      if (tf === 'month') entry.month_pct = asset.change_pct;
      composite.set(ticker, entry);
    }
  }

  return [...composite.values()]
    .sort((a, b) => b.composite_score - a.composite_score)
    .slice(0, limit)
    .map((row) => ({
      ...row,
      composite_score: Math.round(row.composite_score * 10) / 10,
    }));
};

const LIVE_BATCH_SIZE = 6;

function scoreFromChangePct(changePct, volCap = 3) {
  const clamped = Math.max(-volCap, Math.min(volCap, changePct));
  const scoreBase = 50 + (clamped / volCap) * 45;
  return Math.max(10, Math.min(99, Math.round(scoreBase * 10) / 10));
}

function verdictFromScore(score) {
  if (score >= 65) return 'KEEP';
  if (score < 35) return 'ABORT';
  return 'MONITOR';
}

/**
 * Live day-change strength deck via Yahoo (cross-platform). Falls back to synthetic deck on failure.
 */
export async function calculateLiveMarketStrength(timeframe = 'day', sector = 'all') {
  const tf = timeframe.toLowerCase().trim();
  const sec = sector.toLowerCase().trim();

  if (tf !== 'day') {
    const synthetic = calculateMarketStrength(tf, sec);
    return { ...synthetic, live_attempted: true, live_unavailable_reason: 'Live quotes only wired for day timeframe' };
  }

  const universe = ASSET_UNIVERSE.filter((a) => sec === 'all' || a.sectors.includes(sec));
  const syntheticByTicker = new Map(
    calculateMarketStrength('day', 'all').all_assets.map((a) => [a.ticker, a]),
  );
  const scoredAssets = [];
  let liveHits = 0;

  for (let i = 0; i < universe.length; i += LIVE_BATCH_SIZE) {
    const batch = universe.slice(i, i + LIVE_BATCH_SIZE);
    const snaps = await Promise.all(
      batch.map(async (asset) => {
        try {
          return await fetchYahooDaySnapshot(asset.ticker);
        } catch {
          return null;
        }
      }),
    );
    for (let j = 0; j < batch.length; j += 1) {
      const asset = batch[j];
      const snap = snaps[j];
      if (snap?.price != null) {
        liveHits += 1;
        const changePct = snap.change_pct ?? 0;
        const advisorScore = scoreFromChangePct(changePct);
        scoredAssets.push({
          ticker: asset.ticker,
          name: asset.name,
          price: snap.price,
          change_pct: changePct,
          score: advisorScore,
          verdict: verdictFromScore(advisorScore),
          sectors: asset.sectors,
          live: true,
        });
      } else {
        const fallback = syntheticByTicker.get(asset.ticker);
        if (fallback) scoredAssets.push({ ...fallback, live: false });
      }
    }
  }

  if (liveHits < Math.max(8, Math.floor(universe.length * 0.25))) {
    const synthetic = calculateMarketStrength(tf, sec);
    return {
      ...synthetic,
      live_attempted: true,
      live_unavailable_reason: `Only ${liveHits}/${universe.length} live quotes — showing simulated deck`,
    };
  }

  const gainersSorted = [...scoredAssets].sort((a, b) => b.change_pct - a.change_pct);
  const declinersSorted = [...scoredAssets].sort((a, b) => a.change_pct - b.change_pct);

  return {
    timeframe: tf,
    sector: sec,
    data_synthetic: false,
    live_quotes: liveHits,
    disclaimer: 'Live day-change deck from public quotes. Week/month still use horizon models elsewhere.',
    all_assets: scoredAssets,
    top_gainers: gainersSorted.slice(0, 15),
    worst_decliners: declinersSorted.slice(0, 15),
  };
}
