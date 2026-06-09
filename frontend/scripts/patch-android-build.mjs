// ./frontend/scripts/patch-android-build.mjs
/**
 * Patch Capacitor android/app/build.gradle with semver versionCode/versionName
 * and optional release signing config for consistent sideload upgrades.
 *
 * Run after `npx cap sync android` in CI or locally.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, '..');
const appVersionPath = resolve(frontendRoot, 'src/appVersion.js');
const buildGradlePath = resolve(frontendRoot, 'android/app/build.gradle');

function readAppVersion() {
  const src = readFileSync(appVersionPath, 'utf8');
  const match = src.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (!match) throw new Error(`Could not parse APP_VERSION from ${appVersionPath}`);
  return match[1];
}

function semverToVersionCode(version) {
  const parts = String(version).split('.').map((n) => Number(n) || 0);
  const [major = 0, minor = 0, patch = 0] = parts;
  return major * 10000 + minor * 100 + patch;
}

function ensureSigningConfig(gradle) {
  if (gradle.includes('signingConfigs')) return gradle;

  const signingBlock = `
    signingConfigs {
        release {
            def storePath = System.getenv('SIDEKICK_ANDROID_KEYSTORE') ?: project.findProperty('SIDEKICK_ANDROID_KEYSTORE')
            def storePass = System.getenv('SIDEKICK_ANDROID_KEYSTORE_PASSWORD') ?: project.findProperty('SIDEKICK_ANDROID_KEYSTORE_PASSWORD')
            def aliasName = System.getenv('SIDEKICK_ANDROID_KEY_ALIAS') ?: project.findProperty('SIDEKICK_ANDROID_KEY_ALIAS')
            def keyPass = System.getenv('SIDEKICK_ANDROID_KEY_PASSWORD') ?: project.findProperty('SIDEKICK_ANDROID_KEY_PASSWORD')
            if (storePath && storePass && aliasName && keyPass) {
                storeFile file(storePath)
                storePassword storePass
                keyAlias aliasName
                keyPassword keyPass
            }
        }
    }
`;

  return gradle.replace(
    /defaultConfig\s*\{/,
    `${signingBlock}\n    defaultConfig {`
  );
}

function ensureReleaseSigning(gradle) {
  if (gradle.includes('sidekickReleaseSigningApplied')) return gradle;
  return gradle.replace(
    /release\s*\{\s*\n\s*minifyEnabled false/,
    `release {
            // sidekickReleaseSigningApplied — use release keystore when env/props are set
            if (signingConfigs.release.storeFile != null) {
                signingConfig signingConfigs.release
            }
            minifyEnabled false`
  );
}

function ensureAgp9ProguardCompat(gradle) {
  return gradle.replace(
    /getDefaultProguardFile\('proguard-android\.txt'\)/g,
    "getDefaultProguardFile('proguard-android-optimize.txt')",
  );
}

if (!existsSync(buildGradlePath)) {
  console.error(`Missing ${buildGradlePath}. Run npx cap add android first.`);
  process.exit(1);
}

const versionName = readAppVersion();
const versionCode = semverToVersionCode(versionName);

let gradle = readFileSync(buildGradlePath, 'utf8');
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
gradle = ensureSigningConfig(gradle);
gradle = ensureReleaseSigning(gradle);
gradle = ensureAgp9ProguardCompat(gradle);

writeFileSync(buildGradlePath, gradle);
console.log(`Patched Android build: versionName=${versionName} versionCode=${versionCode}`);
