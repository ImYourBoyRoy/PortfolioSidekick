// ./sidekick/src/serverless/money.js
/**
 * Fixed-precision money helpers (integer cents) — avoid float drift on account totals.
 * Created by: Roy Dawson IV
 */

/** @typedef {{ cents: bigint, nullable?: boolean }} Money */

export const MONEY_NULL = { cents: 0n, nullable: true };

export function isMoney(value) {
  return value != null && typeof value.cents === 'bigint' && !value.nullable;
}

export function moneyFromCents(cents) {
  if (typeof cents === 'bigint') return { cents };
  if (typeof cents === 'number' && Number.isFinite(cents)) return { cents: BigInt(Math.round(cents)) };
  return MONEY_NULL;
}

export function moneyFromString(value) {
  if (value == null || value === '') return MONEY_NULL;
  const text = String(value).trim().replace(/,/g, '');
  if (!text) return MONEY_NULL;
  const negative = text.startsWith('-');
  const raw = negative ? text.slice(1) : text;
  const match = raw.match(/^(\d+)(?:\.(\d{1,}))?$/);
  if (!match) return MONEY_NULL;
  const whole = BigInt(match[1]);
  const frac = (match[2] || '').padEnd(2, '0').slice(0, 2);
  const cents = whole * 100n + BigInt(frac || '0');
  return { cents: negative ? -cents : cents };
}

export function moneyFromNumber(value) {
  if (value == null || value === '') return MONEY_NULL;
  const n = Number(value);
  if (!Number.isFinite(n)) return MONEY_NULL;
  return { cents: BigInt(Math.round(n * 100)) };
}

export function moneyFromProduct(quantity, unitPrice) {
  const q = Number(quantity);
  const p = Number(unitPrice);
  if (!Number.isFinite(q) || !Number.isFinite(p)) return MONEY_NULL;
  return { cents: BigInt(Math.round(q * p * 100)) };
}

export function moneyAdd(...values) {
  let total = 0n;
  let any = false;
  for (const value of values) {
    if (!isMoney(value)) continue;
    total += value.cents;
    any = true;
  }
  return any ? { cents: total } : MONEY_NULL;
}

export function moneySub(left, right) {
  if (!isMoney(left) || !isMoney(right)) return MONEY_NULL;
  return { cents: left.cents - right.cents };
}

export function moneyAbs(value) {
  if (!isMoney(value)) return MONEY_NULL;
  return value.cents < 0n ? { cents: -value.cents } : value;
}

export function moneyMax(...values) {
  const present = values.filter(isMoney);
  if (!present.length) return MONEY_NULL;
  return present.reduce((best, row) => (row.cents > best.cents ? row : best), present[0]);
}

export function moneyEquals(left, right) {
  if (!isMoney(left) || !isMoney(right)) return false;
  return left.cents === right.cents;
}

export function moneyIsZero(value) {
  return isMoney(value) && value.cents === 0n;
}

/** Display / JSON serialization only — not for further math. */
export function moneyFormat(value, { signed = false } = {}) {
  if (!isMoney(value)) return null;
  const negative = value.cents < 0n;
  const abs = negative ? -value.cents : value.cents;
  const whole = abs / 100n;
  const frac = abs % 100n;
  const body = `${whole}.${frac.toString().padStart(2, '0')}`;
  if (!signed) return negative ? `-${body}` : body;
  return negative ? `-${body}` : body;
}

export function moneyToNumber(value) {
  if (!isMoney(value)) return null;
  return Number(value.cents) / 100;
}
