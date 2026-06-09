// ./frontend/scripts/upgrade-android-gradle.mjs
/**
 * Point the Capacitor Android Gradle wrapper at the latest stable Gradle release.
 * Resolves version from https://services.gradle.org/versions/current (GA only).
 *
 * Run after `npx cap sync android` in CI or locally, before `./gradlew assemble*`.
 *
 * Created by: Roy Dawson IV
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const androidRoot = resolve(__dirname, '../android');
const wrapperProps = resolve(androidRoot, 'gradle/wrapper/gradle-wrapper.properties');
const gradlew = resolve(androidRoot, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');

const GRADLE_CURRENT_URL = 'https://services.gradle.org/versions/current';

/**
 * @returns {Promise<{ version: string, downloadUrl: string }>}
 */
async function fetchLatestStableGradle() {
  const response = await fetch(GRADLE_CURRENT_URL, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Gradle version API failed: HTTP ${response.status}`);
  }

  const payload = await response.json();
  const version = String(payload?.version || '').trim();
  const downloadUrl = String(payload?.downloadUrl || '').trim();

  if (!version) {
    throw new Error('Gradle version API returned an empty version.');
  }
  if (payload?.broken) {
    throw new Error(`Gradle ${version} is marked broken by services.gradle.org.`);
  }
  if (payload?.snapshot || payload?.nightly || payload?.activeRc) {
    throw new Error(`Refusing non-GA Gradle release: ${version}`);
  }
  if (!payload?.released) {
    throw new Error(`Refusing unreleased Gradle version: ${version}`);
  }

  const allZipUrl = downloadUrl.replace(/-bin\.zip$/, '-all.zip');
  return { version, downloadUrl: allZipUrl };
}

/**
 * @param {string} distributionUrl
 */
function patchWrapperProperties(distributionUrl) {
  let contents = readFileSync(wrapperProps, 'utf8');
  const escaped = distributionUrl.replace(/:/g, '\\:');
  if (/^distributionUrl=.*$/m.test(contents)) {
    contents = contents.replace(/^distributionUrl=.*$/m, `distributionUrl=${escaped}`);
  } else {
    contents += `\ndistributionUrl=${escaped}\n`;
  }
  writeFileSync(wrapperProps, contents);
}

/**
 * @param {string} version
 */
function refreshWrapperFiles(version) {
  const args = ['wrapper', `--gradle-version=${version}`, '--distribution-type=all'];
  const result = spawnSync(gradlew, args, {
    cwd: androidRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`gradlew wrapper failed (exit ${result.status ?? 'unknown'})`);
  }
}

if (!existsSync(wrapperProps)) {
  console.error(`Missing ${wrapperProps}. Run npx cap add android first.`);
  process.exit(1);
}

const { version, downloadUrl } = await fetchLatestStableGradle();
console.log(`Upgrading Android Gradle wrapper to stable ${version}…`);
patchWrapperProperties(downloadUrl);
refreshWrapperFiles(version);
console.log(`Gradle wrapper upgraded to ${version}`);
