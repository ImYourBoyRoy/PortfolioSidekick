// ./frontend/scripts/upgrade-ci-toolchain.mjs
/**
 * Audit and optionally refresh shared CI / desktop toolchain pins.
 *
 * Policy (see AGENTS.md):
 * - Node: frontend/.node-version holds the major line; CI uses setup-node check-latest.
 * - Rust: rust-toolchain.toml channel = stable; CI uses dtolnay/rust-toolchain@master.
 * - GitHub official actions: latest major tag + check-latest where supported.
 * - Third-party actions: @master when the repo has a master branch; else latest major version tag.
 *   rust-cache: @v2 (no reliable master pin; explicit workspace target mapping).
 *
 * Usage:
 *   node scripts/upgrade-ci-toolchain.mjs           # report (default)
 *   node scripts/upgrade-ci-toolchain.mjs --check   # CI gate — exit 1 on policy violations
 *   node scripts/upgrade-ci-toolchain.mjs --sync-node  # bump .node-version to latest even major
 *
 * Created by: Roy Dawson IV
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, '..');
const repoRoot = resolve(frontendRoot, '..');

const NODE_INDEX_URL = 'https://nodejs.org/dist/index.json';
const WORKFLOW_PATH = resolve(repoRoot, '.github/workflows/build.yml');

/** Expected CI action pins — update when GitHub ships new majors. */
const EXPECTED_CI_ACTIONS = [
  { pattern: /actions\/checkout@v6\b/, label: 'actions/checkout@v6' },
  { pattern: /actions\/setup-node@v6\b/, label: 'actions/setup-node@v6' },
  { pattern: /check-latest:\s*true/, label: 'setup-node check-latest: true' },
  { pattern: /dtolnay\/rust-toolchain@master\b/, label: 'dtolnay/rust-toolchain@master' },
  { pattern: /toolchain:\s*stable\b/, label: 'rust toolchain: stable' },
  { pattern: /swatinem\/rust-cache@v2\b/, label: 'swatinem/rust-cache@v2' },
  { pattern: /actions\/upload-artifact@v7\b/, label: 'actions/upload-artifact@v7' },
  { pattern: /actions\/download-artifact@v8\b/, label: 'actions/download-artifact@v8' },
  { pattern: /actions\/cache@v5\b/, label: 'actions/cache@v5' },
  { pattern: /softprops\/action-gh-release@master\b/, label: 'softprops/action-gh-release@master' },
];

/**
 * @returns {Promise<{ version: string, lts: string[] }>}
 */
async function fetchLatestNodeRelease() {
  const response = await fetch(NODE_INDEX_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Node.js index failed: HTTP ${response.status}`);
  }

  const releases = await response.json();
  const latest = releases.find((entry) => entry?.lts === false && !entry?.version.includes('-'));
  if (!latest) {
    throw new Error('Could not resolve latest Node.js current release from index.json');
  }

  const ltsEntries = releases.filter((entry) => typeof entry?.lts === 'string');
  return {
    version: latest.version.replace(/^v/, ''),
    lts: ltsEntries.map((entry) => `${entry.version.replace(/^v/, '')} (${entry.lts})`),
  };
}

/**
 * Latest even major from Node current (24, 26, …) — matches project even-major policy.
 * @param {string} version
 */
function majorLine(version) {
  const major = Number.parseInt(version.split('.')[0], 10);
  if (Number.isNaN(major)) {
    throw new Error(`Invalid semver: ${version}`);
  }
  return String(major % 2 === 0 ? major : major - 1);
}

/**
 * @param {string} path
 */
function readText(path) {
  if (!existsSync(path)) {
    throw new Error(`Missing required file: ${path}`);
  }
  return readFileSync(path, 'utf8');
}

function auditRustToolchain() {
  const path = resolve(frontendRoot, 'src-tauri/rust-toolchain.toml');
  const contents = readText(path);
  const match = contents.match(/^channel\s*=\s*"([^"]+)"/m);
  const channel = match?.[1] ?? '';
  return { path, channel, ok: channel === 'stable' };
}

function auditNodeVersionFile() {
  const path = resolve(frontendRoot, '.node-version');
  const raw = readText(path).trim();
  const ok = /^\d+$/.test(raw);
  return { path, major: raw, ok };
}

function auditPackageEngines() {
  const pkg = JSON.parse(readText(resolve(frontendRoot, 'package.json')));
  const enginesNode = String(pkg?.engines?.node ?? '');
  const nodeMajor = auditNodeVersionFile().major;
  const ok = enginesNode.includes(nodeMajor) || enginesNode.includes('>=');
  return { enginesNode, ok };
}

function auditWorkflow() {
  const contents = readText(WORKFLOW_PATH);
  const results = EXPECTED_CI_ACTIONS.map(({ pattern, label }) => ({
    label,
    ok: pattern.test(contents),
  }));
  return results;
}

/**
 * @param {boolean} checkMode
 * @param {boolean} syncNode
 */
async function main(checkMode, syncNode) {
  const nodeFile = auditNodeVersionFile();
  const rust = auditRustToolchain();
  const engines = auditPackageEngines();
  const workflow = auditWorkflow();
  const { version: latestNode, lts } = await fetchLatestNodeRelease();
  const latestMajorLine = majorLine(latestNode);

  console.log('=== Portfolio Sidekick — CI / desktop toolchain audit ===\n');
  console.log(`Node .node-version major line: ${nodeFile.major}${nodeFile.ok ? '' : ' (INVALID)'}`);
  console.log(`Node latest current: v${latestNode}`);
  console.log(`Node LTS releases: ${lts.join(', ') || 'none listed'}`);
  console.log(`Suggested major line from index: ${latestMajorLine}`);
  console.log(`Rust channel (rust-toolchain.toml): ${rust.channel}${rust.ok ? '' : ' (expected stable)'}`);
  console.log(`package.json engines.node: ${engines.enginesNode}`);
  console.log('\nCI workflow action policy:');
  for (const item of workflow) {
    console.log(`  ${item.ok ? '✓' : '✗'} ${item.label}`);
  }

  if (syncNode && latestMajorLine !== nodeFile.major) {
    writeFileSync(nodeFile.path, `${latestMajorLine}\n`);
    console.log(`\nUpdated ${nodeFile.path} → ${latestMajorLine}`);
  } else if (syncNode) {
    console.log(`\n.node-version already at major line ${nodeFile.major}; no change.`);
  } else if (latestMajorLine !== nodeFile.major) {
    console.log(`\nHint: run with --sync-node to bump .node-version ${nodeFile.major} → ${latestMajorLine}`);
  }

  const violations = [];
  if (!nodeFile.ok) violations.push('.node-version must be a single major number');
  if (!rust.ok) violations.push('rust-toolchain.toml channel must be "stable"');
  if (!engines.ok) violations.push('package.json engines.node should align with .node-version');
  for (const item of workflow) {
    if (!item.ok) violations.push(`workflow missing: ${item.label}`);
  }

  if (violations.length > 0) {
    console.error('\nPolicy violations:');
    for (const v of violations) console.error(`  - ${v}`);
    if (checkMode) process.exit(1);
    return;
  }

  console.log('\nAll toolchain policy checks passed.');
}

const args = new Set(process.argv.slice(2));
const checkMode = args.has('--check');
const syncNode = args.has('--sync-node');

if (args.has('--help') || args.has('-h')) {
  console.log(`Usage: node scripts/upgrade-ci-toolchain.mjs [--check] [--sync-node]`);
  process.exit(0);
}

await main(checkMode, syncNode);
