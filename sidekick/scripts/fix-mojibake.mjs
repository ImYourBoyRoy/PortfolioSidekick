// ./sidekick/scripts/fix-mojibake.mjs
/**
 * Repair UTF-8 mojibake introduced when App.jsx was split on Windows.
 * Run: node scripts/fix-mojibake.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', 'src', 'app');

/** Mojibake (UTF-8 read as Latin-1/CP1252) → correct Unicode */
const REPLACEMENTS = [
  ['ΓÇö', '—'],
  ['ΓÇô', '–'],
  ['ΓÇª', '…'],
  ['ΓÇó', '•'],
  ['Γû▓', '▲'],
  ['Γû╝', '▼'],
  ['Γùå', '◆'],
  ['ΓåÆ', '→'],
  ['≡ƒöÆ', '🔒'],
  ['≡ƒÆí', '💡'],
  ['≡ƒÄô', '🎓'],
  ['≡ƒÜ¿', '🚨'],
  ['≡ƒƒó', '🟢'],
  ['≡ƒƒí', '🟡'],
  ['≡ƒö┤', '🔴'],
  ['≡ƒÜÇ', '🚀'],
  ['≡ƒÄ»', '🎯'],
  ['≡ƒîà', '🌅'],
  ['≡ƒôà', '📅'],
  ['≡ƒîî', '🌌'],
  ['≡ƒö¼', '🔬'],
];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(jsx?|tsx?)$/.test(name)) out.push(full);
  }
  return out;
}

let filesChanged = 0;
let totalReplacements = 0;

for (const file of walk(root)) {
  let text = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (const [bad, good] of REPLACEMENTS) {
    const count = (text.match(new RegExp(bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    if (count > 0) {
      text = text.split(bad).join(good);
      totalReplacements += count;
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(file, text, 'utf8');
    filesChanged += 1;
    console.log('fixed:', path.relative(path.join(__dirname, '..'), file));
  }
}

console.log(`\nDone: ${totalReplacements} replacements in ${filesChanged} files.`);
