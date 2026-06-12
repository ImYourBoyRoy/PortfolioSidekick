// ./sidekick/scripts/check-domain-dedupe.mjs
/**
 * Reports duplicate function definitions and overlapping return keys across domain hooks.
 * Run: node sidekick/scripts/check-domain-dedupe.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const domainsDir = path.join(__dirname, '../src/app/hooks/domains');

const files = fs.readdirSync(domainsDir).filter((f) => f.startsWith('useSidekick') && f.endsWith('.js'));

const fnPattern = /^\s{2}const\s+(\w+)\s*=\s*(?:useCallback\(|async\s)/gm;
const returnKeyPattern = /^\s{4}(\w+),?\s*$/gm;

const fnByFile = new Map();
const keysByFile = new Map();

for (const file of files) {
  const text = fs.readFileSync(path.join(domainsDir, file), 'utf8');
  const fns = [...text.matchAll(fnPattern)].map((m) => m[1]);
  fnByFile.set(file, fns);

  const returnIdx = text.lastIndexOf('return useMemo(() => ({');
  const plainReturnIdx = text.lastIndexOf('return {');
  const sliceStart = returnIdx >= 0 ? returnIdx : plainReturnIdx;
  let slice = sliceStart >= 0 ? text.slice(sliceStart) : '';
  const depsIdx = slice.indexOf('}), [');
  if (depsIdx >= 0) slice = slice.slice(0, depsIdx);
  else {
    const closeIdx = slice.indexOf('\n});');
    if (closeIdx >= 0) slice = slice.slice(0, closeIdx);
  }
  const keys = [...slice.matchAll(returnKeyPattern)].map((m) => m[1]);
  keysByFile.set(file, keys);
}

console.log('Domain hook files:', files.join(', '));
console.log('');

const allFns = new Map();
for (const [file, fns] of fnByFile) {
  for (const fn of fns) {
    if (!allFns.has(fn)) allFns.set(fn, []);
    allFns.get(fn).push(file);
  }
}

const dupFns = [...allFns.entries()].filter(([, owners]) => owners.length > 1);
if (dupFns.length === 0) {
  console.log('OK: no duplicate function definitions across domain hooks.');
} else {
  console.log('DUPLICATE FUNCTIONS:');
  for (const [fn, owners] of dupFns.sort()) {
    console.log(`  ${fn}: ${owners.join(', ')}`);
  }
}
console.log('');

const allKeys = new Map();
for (const [file, keys] of keysByFile) {
  for (const key of keys) {
    if (!allKeys.has(key)) allKeys.set(key, []);
    allKeys.get(key).push(file);
  }
}

const dupKeys = [...allKeys.entries()].filter(([, owners]) => owners.length > 1);
if (dupKeys.length === 0) {
  console.log('OK: no overlapping return keys across domain hooks.');
} else {
  console.log('OVERLAPPING RETURN KEYS (dedupe via legacy merge — slim domain returns):');
  for (const [key, owners] of dupKeys.sort()) {
    console.log(`  ${key}: ${owners.join(', ')}`);
  }
}

process.exit(dupFns.length > 0 ? 1 : 0);
