// ./frontend/src/serverless/housePtrParser.js
/**
 * Parse Periodic Transaction Report PDFs from disclosures-clerk.house.gov.
 * Uses pdfjs-dist (dynamic import) on extracted plaintext.
 *
 * Created by: Roy Dawson IV
 */

function normalizeType(raw) {
  const t = String(raw || '').toLowerCase();
  if (t === 'p' || t.includes('purchase') || t.includes('buy')) return 'buy';
  if (t.startsWith('s') || t.includes('sale') || t.includes('sell')) return 'sell';
  if (t === 'e' || t.includes('exchange')) return 'exchange';
  return 'other';
}

function parseUsDate(value) {
  if (!value) return null;
  const m = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2])).getTime();
}

async function extractPdfText(arrayBuffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.mjs',
    import.meta.url
  ).toString();

  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const parts = [];
  for (let page = 1; page <= doc.numPages; page += 1) {
    const pageObj = await doc.getPage(page);
    const content = await pageObj.getTextContent();
    parts.push(content.items.map((item) => item.str).join(' '));
  }
  return parts.join('\n');
}

/**
 * @param {ArrayBuffer} arrayBuffer
 * @param {{ politician?: string, ptrLink?: string, disclosureDate?: number, docId?: string }} meta
 */
export async function parseHousePtrPdf(arrayBuffer, meta = {}) {
  const text = await extractPdfText(arrayBuffer);
  const trades = [];
  const assetRe =
    /SP\s+(.+?)\s*\(([A-Z][A-Z0-9.-]{0,6})\)\s*\[(?:ST|OP|CS|MF|ET|OT|DB|PS|RF|RM|UT|OI|DO|IV|AB|CT|DA|GC|IC|IE|IP|MA|OI|RE|SN|TR|VI|VO|WI)\]/gi;

  let assetMatch;
  while ((assetMatch = assetRe.exec(text)) !== null) {
    const asset = assetMatch[1].replace(/\s+/g, ' ').trim();
    const ticker = assetMatch[2].toUpperCase();
    const slice = text.slice(assetMatch.index, assetMatch.index + 500);
    const txMatch = slice.match(
      /(P|S(?:\s*\([^)]+\))?|E)\s+(\d{2}\/\d{2}\/\d{4})\s*(\d{2}\/\d{2}\/\d{4})?\s*(\$[\d,]+(?:\.\d+)?\s*-\s*\$[\d,]+(?:\.\d+)?)/i
    );
    if (!txMatch) continue;

    const txDate = parseUsDate(txMatch[2]);
    trades.push({
      id: `house-tx-${meta.docId || 'na'}-${ticker}-${txMatch[2]}-${txMatch[1]}`,
      politician: meta.politician || '',
      chamber: 'house',
      ticker,
      asset,
      type: normalizeType(txMatch[1]),
      amount: txMatch[4].replace(/\s+/g, ' '),
      owner: 'SP',
      transactionDate: txDate,
      disclosureDate: meta.disclosureDate || txDate,
      ptrLink: meta.ptrLink || '',
    });
  }

  return trades;
}
