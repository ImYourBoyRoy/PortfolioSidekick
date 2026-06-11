// ./sidekick/src/serverless/congressTrades.js

/**

 * Congressional stock trade tracker — STOCK Act disclosures from official sources.

 * House: disclosures-clerk.house.gov annual FD.xml + PTR PDFs.

 * Senate: efdsearch.senate.gov session search + PTR HTML detail pages.

 *

 * Note: disclosures may lag trades by up to 45 days (STOCK Act).

 *

 * Created by: Roy Dawson IV

 */



import { nativeHttpGetText, nativeHttpGetArrayBuffer, NativeHttpSession } from './nativeHttp.js';

import { parseHousePtrPdf } from './housePtrParser.js';



const CACHE_KEY = 'ps_congress_trades_v2';

export const CONGRESS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export const STOCK_ACT_MAX_LAG_DAYS = 45;

const CACHE_TTL_MS = CONGRESS_CACHE_TTL_MS;

const HOUSE_CLERK = 'https://disclosures-clerk.house.gov';

const SENATE_EFD = 'https://efdsearch.senate.gov';

const MAX_HOUSE_PDFS_PER_INSIDER = 6;

const MAX_SENATE_PTRS_PER_INSIDER = 8;



/** @typedef {{ key: string, label: string, lastName: string, firstName?: string, chamber: 'house'|'senate'|'both' }} Insider */



/** @type {Insider[]} */

export const DEFAULT_TRACKED_INSIDERS = [

  { key: 'pelosi', label: 'Nancy Pelosi', lastName: 'Pelosi', firstName: 'Nancy', chamber: 'house' },

  { key: 'gottheimer', label: 'Josh Gottheimer', lastName: 'Gottheimer', firstName: 'Josh', chamber: 'house' },

  { key: 'crenshaw', label: 'Dan Crenshaw', lastName: 'Crenshaw', firstName: 'Dan', chamber: 'house' },

  { key: 'tuberville', label: 'Tommy Tuberville', lastName: 'Tuberville', firstName: 'Tommy', chamber: 'senate' },

  { key: 'scott', label: 'Rick Scott', lastName: 'Scott', firstName: 'Rick', chamber: 'senate' },

  { key: 'warren', label: 'Elizabeth Warren', lastName: 'Warren', firstName: 'Elizabeth', chamber: 'senate' },

  { key: 'mcconnell', label: 'Mitch McConnell', lastName: 'McConnell', firstName: 'Mitch', chamber: 'senate' },

  { key: 'kelly', label: 'Mark Kelly', lastName: 'Kelly', firstName: 'Mark', chamber: 'senate' },

];



const DAY_MS = 86400000;



function parseUsDate(value) {

  if (!value) return null;

  const s = String(value).trim();

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime();

  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);

  if (us) return new Date(Number(us[3]), Number(us[1]) - 1, Number(us[2])).getTime();

  return null;

}



function normalizeType(raw) {

  const t = String(raw || '').toLowerCase();

  if (t.includes('purchase') || t === 'p' || t.includes('buy')) return 'buy';

  if (t.includes('sale') || t === 's' || t.includes('sell')) return 'sell';

  if (t.includes('exchange')) return 'exchange';

  return 'other';

}



function yearsForWindow(daysBack) {

  const now = new Date();

  const start = new Date(now.getTime() - daysBack * DAY_MS);

  const years = new Set([now.getFullYear(), start.getFullYear()]);

  return [...years].sort((a, b) => b - a);

}



function formatSenateStartDate(daysBack) {

  const d = new Date(Date.now() - daysBack * DAY_MS);

  const mm = String(d.getMonth() + 1).padStart(2, '0');

  const dd = String(d.getDate()).padStart(2, '0');

  return `${mm}/${dd}/${d.getFullYear()} 00:00:00`;

}



function matchesHouseMember(member, insider) {

  const last = (member.querySelector('Last')?.textContent || '').trim().toLowerCase();

  const first = (member.querySelector('First')?.textContent || '').trim().toLowerCase();

  if (last !== insider.lastName.toLowerCase()) return false;

  if (insider.firstName && !first.includes(insider.firstName.toLowerCase())) return false;

  return true;

}



function readCache() {

  try {

    const raw = localStorage.getItem(CACHE_KEY);

    if (!raw) return null;

    const parsed = JSON.parse(raw);

    if (!parsed?.fetchedAt || !Array.isArray(parsed.trades)) return null;

    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;

    return parsed;

  } catch {

    return null;

  }

}



function writeCache(payload) {

  try {

    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));

  } catch {

    // Quota exceeded — skip cache.

  }

}



function formatRelativeMs(timestamp, now = Date.now()) {

  const diff = now - timestamp;

  const mins = Math.floor(diff / 60000);

  if (mins < 1) return 'just now';

  if (mins < 60) return `${mins}m ago`;

  const hrs = Math.floor(mins / 60);

  if (hrs < 24) return `${hrs}h ago`;

  const days = Math.floor(hrs / 24);

  if (days < 30) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();

}



function formatRelativeUntil(targetMs, now = Date.now()) {

  const until = targetMs - now;

  if (until <= 0) return 'due now';

  if (until < 60000) return 'in less than a minute';

  const mins = Math.ceil(until / 60000);

  if (until < 3600000) return `in ${mins}m`;

  const hrs = Math.ceil(until / 3600000);

  return `in ${hrs}h`;

}



/**

 * @param {object} parsed

 * @param {boolean} fromCache

 */

function enrichCongressPayload(parsed, fromCache) {

  const fetchedAt = parsed.fetchedAt || Date.now();

  const nextRefreshAt = fetchedAt + CACHE_TTL_MS;

  const cacheHours = CACHE_TTL_MS / 3600000;

  return {

    ...parsed,

    fromCache,

    cacheTtlMs: CACHE_TTL_MS,

    stockActMaxLagDays: STOCK_ACT_MAX_LAG_DAYS,

    nextRefreshAt,

    disclaimer:

      `STOCK Act filings may appear up to ${STOCK_ACT_MAX_LAG_DAYS} days after the underlying trade. ` +

      `We sync directly from the U.S. House Clerk and Senate eFD portals every ${cacheHours}h while this tab is open — not investment advice.`,

  };

}



/**

 * @param {string} xmlText

 * @param {Insider[]} insiders

 * @param {number} cutoff

 */

function parseHouseFdXml(xmlText, insiders, cutoff) {

  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');

  const filings = [];



  for (const member of doc.querySelectorAll('Member')) {

    const filingType = (member.querySelector('FilingType')?.textContent || '').trim();

    if (filingType !== 'P') continue;



    const insider = insiders.find((i) => i.chamber === 'house' && matchesHouseMember(member, i));

    if (!insider) continue;



    const year = (member.querySelector('Year')?.textContent || '').trim();

    const docId = (member.querySelector('DocID')?.textContent || '').trim();

    const filingDate = parseUsDate(member.querySelector('FilingDate')?.textContent || '');

    if (!year || !docId) continue;

    if (filingDate && filingDate < cutoff) continue;



    const prefix = (member.querySelector('Prefix')?.textContent || '').trim();

    const first = (member.querySelector('First')?.textContent || '').trim();

    const last = (member.querySelector('Last')?.textContent || '').trim();

    const stateDst = (member.querySelector('StateDst')?.textContent || '').trim();



    filings.push({

      insider,

      politician: [prefix, first, last].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),

      year,

      docId,

      filingDate,

      district: stateDst,

      ptrLink: `${HOUSE_CLERK}/public_disc/ptr-pdfs/${year}/${docId}.pdf`,

    });

  }



  filings.sort((a, b) => (b.filingDate || 0) - (a.filingDate || 0));

  return filings;

}



async function fetchHouseFilings(insiders, daysBack, cutoff) {

  const years = yearsForWindow(daysBack);

  const allFilings = [];



  for (const year of years) {

    const xml = await nativeHttpGetText(`${HOUSE_CLERK}/public_disc/financial-pdfs/${year}FD.xml`, {

      timeoutMs: 60000,

    });

    allFilings.push(...parseHouseFdXml(xml, insiders, cutoff));

  }



  return allFilings;

}



async function fetchHouseTrades(filings) {

  const trades = [];

  const perInsider = new Map();



  for (const filing of filings) {

    const count = perInsider.get(filing.insider.key) || 0;

    if (count >= MAX_HOUSE_PDFS_PER_INSIDER) continue;

    perInsider.set(filing.insider.key, count + 1);



    try {

      const pdf = await nativeHttpGetArrayBuffer(filing.ptrLink, { timeoutMs: 45000 });

      const parsed = await parseHousePtrPdf(pdf, {

        politician: filing.politician,

        ptrLink: filing.ptrLink,

        disclosureDate: filing.filingDate,

        docId: filing.docId,

      });

      for (const row of parsed) {

        trades.push({

          ...row,

          insiderKey: filing.insider.key,

          district: filing.district,

        });

      }

    } catch {

      trades.push({

        id: `house-filing-${filing.docId}`,

        politician: filing.politician,

        insiderKey: filing.insider.key,

        chamber: 'house',

        ticker: null,

        asset: 'Periodic Transaction Report (open PDF for details)',

        type: 'other',

        amount: '',

        owner: '',

        transactionDate: null,

        disclosureDate: filing.filingDate,

        ptrLink: filing.ptrLink,

        district: filing.district,

      });

    }

  }



  return trades;

}



function extractCsrfToken(html) {

  const doc = new DOMParser().parseFromString(html, 'text/html');

  const input = doc.querySelector('input[name="csrfmiddlewaretoken"]');

  return input?.getAttribute('value') || '';

}



const GOV_BROWSER_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
};

async function establishSenateSession() {

  const http = new NativeHttpSession();

  const landingHtml = await http.getText(`${SENATE_EFD}/search/home/`, {
    timeoutMs: 60000,
    headers: GOV_BROWSER_HEADERS,
  });

  const csrf = extractCsrfToken(landingHtml);

  if (!csrf) throw new Error('Senate eFD CSRF token missing');



  const agreeHtml = await http.postForm(

    `${SENATE_EFD}/search/home/`,

    { csrfmiddlewaretoken: csrf, prohibition_agreement: '1' },

    { timeoutMs: 60000, headers: { ...GOV_BROWSER_HEADERS, Referer: `${SENATE_EFD}/search/home/`, Origin: SENATE_EFD } }

  );

  const token = extractCsrfToken(agreeHtml) || http.getCookie('csrftoken') || csrf;

  return { http, csrfToken: token };

}



async function searchSenatePtrReports(session, insider, daysBack) {

  const form = {

    draw: '1',

    start: '0',

    length: String(MAX_SENATE_PTRS_PER_INSIDER),

    report_types: '[11]',

    filer_types: '[]',

    submitted_start_date: formatSenateStartDate(daysBack),

    submitted_end_date: '',

    candidate_state: '',

    senator_state: '',

    office_id: '',

    first_name: insider.firstName || '',

    last_name: insider.lastName,

    csrfmiddlewaretoken: session.csrfToken,

  };



  const jsonText = await session.http.postForm(`${SENATE_EFD}/search/report/data/`, form, {

    timeoutMs: 60000,

    headers: {
      ...GOV_BROWSER_HEADERS,
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: `${SENATE_EFD}/search/`,
      Origin: SENATE_EFD,
      'X-CSRFToken': session.csrfToken,
      'X-Requested-With': 'XMLHttpRequest',
    },

  });

  const json = JSON.parse(jsonText);

  const rows = Array.isArray(json?.data) ? json.data : [];

  return rows.map((row) => {

    const linkHtml = row[3] || '';

    const hrefMatch = String(linkHtml).match(/href="([^"]+)"/i);

    const path = hrefMatch ? hrefMatch[1] : '';

    const ptrLink = path ? `${SENATE_EFD}${path}` : '';

    const filedDate = parseUsDate(row[4] || '');

    return {

      insider,

      politician: insider.label,

      ptrLink,

      filedDate,

      senatorField: row[2] || insider.label,

    };

  });

}



function parseSenatePtrHtml(html, meta) {

  const doc = new DOMParser().parseFromString(html, 'text/html');

  const trades = [];

  const rows = doc.querySelectorAll('table.table-striped tbody tr');



  for (const row of rows) {

    const cells = [...row.querySelectorAll('td')];

    if (cells.length < 8) continue;



    const transactionDate = parseUsDate(cells[1]?.textContent || '');

    const owner = (cells[2]?.textContent || '').trim();

    const ticker = (cells[3]?.textContent || '').trim().toUpperCase() || null;

    const asset = (cells[4]?.textContent || '').trim();

    const type = normalizeType(cells[6]?.textContent || '');

    const amount = (cells[7]?.textContent || '').trim();



    trades.push({

      id: `senate-${meta.ptrLink}-${ticker || 'na'}-${transactionDate || meta.filedDate || ''}-${type}`,

      politician: meta.politician,

      insiderKey: meta.insider.key,

      chamber: 'senate',

      ticker: ticker && ticker !== '--' ? ticker : null,

      asset,

      type,

      amount,

      owner,

      transactionDate,

      disclosureDate: meta.filedDate || transactionDate,

      ptrLink: meta.ptrLink,

      district: '',

    });

  }



  return trades;

}



async function fetchSenateTrades(insiders, daysBack, cutoff) {

  const session = await establishSenateSession();

  const senateInsiders = insiders.filter((i) => i.chamber === 'senate');

  const trades = [];



  for (const insider of senateInsiders) {

    let reports;

    try {

      reports = await searchSenatePtrReports(session, insider, daysBack);

    } catch {

      continue;

    }



    for (const report of reports) {

      if (report.filedDate && report.filedDate < cutoff) continue;

      if (!report.ptrLink) continue;



      try {

        const html = await session.http.getText(report.ptrLink, {

          timeoutMs: 60000,

          headers: { Referer: `${SENATE_EFD}/search/` },

        });

        trades.push(...parseSenatePtrHtml(html, report));

      } catch {

        trades.push({

          id: `senate-filing-${report.ptrLink}`,

          politician: report.politician,

          insiderKey: insider.key,

          chamber: 'senate',

          ticker: null,

          asset: 'Periodic Transaction Report (open filing for details)',

          type: 'other',

          amount: '',

          owner: '',

          transactionDate: null,

          disclosureDate: report.filedDate,

          ptrLink: report.ptrLink,

          district: '',

        });

      }

    }

  }



  return trades;

}



/**

 * @param {{ daysBack?: number, insiders?: Insider[], force?: boolean }} [options]

 */

export async function fetchCongressTrades(options = {}) {

  const daysBack = options.daysBack ?? 120;

  const insiders = options.insiders ?? DEFAULT_TRACKED_INSIDERS;

  const cutoff = Date.now() - daysBack * DAY_MS;



  if (!options.force) {

    const cached = readCache();

    if (cached) return enrichCongressPayload(cached, true);

  }



  const errors = [];

  let trades = [];



  try {

    const houseFilings = await fetchHouseFilings(insiders, daysBack, cutoff);

    const houseTrades = await fetchHouseTrades(houseFilings);

    trades.push(...houseTrades);

  } catch (err) {

    errors.push(`House Clerk (${HOUSE_CLERK}): ${err?.message || err}`);

  }



  try {

    const senateTrades = await fetchSenateTrades(insiders, daysBack, cutoff);

    trades.push(...senateTrades);

  } catch (err) {

    errors.push(`Senate eFD (${SENATE_EFD}): ${err?.message || err}`);

  }



  trades = trades.filter((t) => {

    const ref = t.disclosureDate || t.transactionDate;

    return !ref || ref >= cutoff;

  });



  trades.sort((a, b) => (b.disclosureDate || b.transactionDate || 0) - (a.disclosureDate || a.transactionDate || 0));



  const payload = enrichCongressPayload(

    {

      trades: trades.slice(0, 150),

      total: trades.length,

      fetchedAt: Date.now(),

      insiders: insiders.map((i) => i.label),

      sources: [HOUSE_CLERK, SENATE_EFD],

      error: errors.length && trades.length === 0 ? errors.join(' ') : null,
      warnings: errors.length && trades.length > 0 ? errors : [],

    },

    false

  );



  if (trades.length > 0) writeCache(payload);



  return payload;

}



/**

 * @param {{ fetchedAt?: number, nextRefreshAt?: number, fromCache?: boolean } | null} data

 * @param {number} [now]

 */

export function formatCongressSyncStatus(data, now = Date.now()) {

  if (!data?.fetchedAt) {

    return { lastSynced: null, nextRefresh: null, label: '', absoluteSynced: null };

  }

  const lastSynced = formatRelativeMs(data.fetchedAt, now);

  const nextRefresh = formatRelativeUntil(data.nextRefreshAt ?? data.fetchedAt + CACHE_TTL_MS, now);

  const cacheNote = data.fromCache ? ' · cached copy' : '';

  const absoluteSynced = new Date(data.fetchedAt).toLocaleString(undefined, {

    month: 'short',

    day: 'numeric',

    hour: 'numeric',

    minute: '2-digit',

  });

  return {

    lastSynced,

    nextRefresh,

    absoluteSynced,

    label: `Last synced ${lastSynced}${cacheNote} · auto-refresh ${nextRefresh}`,

  };

}



export function formatCongressTradeDate(ms) {

  if (!ms) return '—';

  try {

    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  } catch {

    return '—';

  }

}


