// ./frontend/scripts/upgrade-android-build-deps.mjs
/**
 * Refresh Capacitor Android toolchain + library versions to latest stable releases.
 * Resolves Gradle, AGP, Kotlin, Google Services, AndroidX, okhttp, and Cordova from
 * live registries on each CI/local build.
 *
 * Run after `npx cap sync android` and `inject-android-native.sh`.
 *
 * Created by: Roy Dawson IV
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import {
  fetchLatestStableMavenVersion,
  fetchLatestNpmVersion,
} from './lib/mavenLatest.mjs';
import { applyCompileSdkLine } from './lib/androidSdkGradle.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, '..');
const androidRoot = resolve(frontendRoot, 'android');
const projectGradle = resolve(androidRoot, 'build.gradle');
const appGradle = resolve(androidRoot, 'app/build.gradle');
const variablesGradle = resolve(androidRoot, 'variables.gradle');
const wrapperProps = resolve(androidRoot, 'gradle/wrapper/gradle-wrapper.properties');
const gradlew = resolve(androidRoot, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');

const GRADLE_CURRENT_URL = 'https://services.gradle.org/versions/current';

/** @type {Record<string, { group: string, artifact: string, repo?: 'google' | 'central' }>} */
const VARIABLE_COORDS = {
  androidxActivityVersion: { group: 'androidx.activity', artifact: 'activity' },
  androidxAppCompatVersion: { group: 'androidx.appcompat', artifact: 'appcompat' },
  androidxCoordinatorLayoutVersion: { group: 'androidx.coordinatorlayout', artifact: 'coordinatorlayout' },
  androidxCoreVersion: { group: 'androidx.core', artifact: 'core-ktx' },
  androidxFragmentVersion: { group: 'androidx.fragment', artifact: 'fragment' },
  coreSplashScreenVersion: { group: 'androidx.core', artifact: 'core-splashscreen' },
  androidxWebkitVersion: { group: 'androidx.webkit', artifact: 'webkit' },
  junitVersion: { group: 'junit', artifact: 'junit', repo: 'central' },
  androidxJunitVersion: { group: 'androidx.test.ext', artifact: 'junit' },
  androidxEspressoCoreVersion: { group: 'androidx.test.espresso', artifact: 'espresso-core' },
};

/**
 * @returns {Promise<{ version: string, downloadUrl: string }>}
 */
async function fetchLatestStableGradle() {
  const response = await fetch(GRADLE_CURRENT_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Gradle version API failed: HTTP ${response.status}`);
  }

  const payload = await response.json();
  const version = String(payload?.version || '').trim();
  const downloadUrl = String(payload?.downloadUrl || '').trim();

  if (!version) throw new Error('Gradle version API returned an empty version.');
  if (payload?.broken) throw new Error(`Gradle ${version} is marked broken.`);
  if (payload?.snapshot || payload?.nightly || payload?.activeRc) {
    throw new Error(`Refusing non-GA Gradle release: ${version}`);
  }
  if (!payload?.released) throw new Error(`Refusing unreleased Gradle version: ${version}`);

  return { version, downloadUrl: downloadUrl.replace(/-bin\.zip$/, '-all.zip') };
}

/**
 * @param {string} filePath
 * @param {RegExp} pattern
 * @param {string} replacement
 */
function replaceInFile(filePath, pattern, replacement) {
  const before = readFileSync(filePath, 'utf8');
  if (!pattern.test(before)) {
    throw new Error(`Pattern not found in ${filePath}: ${pattern}`);
  }
  const after = before.replace(pattern, replacement);
  writeFileSync(filePath, after);
}

/**
 * @param {string} distributionUrl
 */
function patchWrapperProperties(distributionUrl) {
  let contents = readFileSync(wrapperProps, 'utf8');
  const escaped = distributionUrl.replace(/:/g, '\\:');
  contents = contents.replace(/^distributionUrl=.*$/m, `distributionUrl=${escaped}`);
  writeFileSync(wrapperProps, contents);
}

/**
 * @param {string} version
 */
function refreshGradleWrapper(version) {
  const wrapperCmd = process.platform === 'win32'
    ? `"${gradlew}" wrapper --gradle-version=${version} --distribution-type=all`
    : `./gradlew wrapper --gradle-version=${version} --distribution-type=all`;
  execSync(wrapperCmd, { cwd: androidRoot, stdio: 'inherit', shell: true });
}

/**
 * @param {string} key
 * @param {string} version
 */
function patchVariableVersion(key, version) {
  let contents = readFileSync(variablesGradle, 'utf8');
  const pattern = new RegExp(`(${key}\\s*=\\s*['"])[^'"]+(['"])`, 'm');
  if (!pattern.test(contents)) {
    throw new Error(`variables.gradle missing key: ${key}`);
  }
  contents = contents.replace(pattern, `$1${version}$2`);
  writeFileSync(variablesGradle, contents);
}

/**
 * @param {string} filePath
 * @param {RegExp} pattern
 * @param {string} replacement
 */
function replaceInFileOptional(filePath, pattern, replacement) {
  const before = readFileSync(filePath, 'utf8');
  if (!pattern.test(before)) return false;
  writeFileSync(filePath, before.replace(pattern, replacement));
  return true;
}

function readSdkVersions() {
  const src = readFileSync(variablesGradle, 'utf8');
  const read = (key, fallback) => {
    const match = src.match(new RegExp(`${key}\\s*=\\s*(\\d+)`));
    return match ? Number(match[1]) : fallback;
  };
  return {
    compileSdk: read('compileSdkVersion', 37),
    targetSdk: read('targetSdkVersion', 36),
    minSdk: read('minSdkVersion', 24),
  };
}

/**
 * @param {string} key
 * @param {number} value
 */
function patchVariableNumericVersion(key, value) {
  let contents = readFileSync(variablesGradle, 'utf8');
  const pattern = new RegExp(`(${key}\\s*=\\s*)\\d+`, 'm');
  if (!pattern.test(contents)) {
    throw new Error(`variables.gradle missing numeric key: ${key}`);
  }
  contents = contents.replace(pattern, `$1${value}`);
  writeFileSync(variablesGradle, contents);
}

/**
 * Raise compileSdk when resolved AndroidX artifacts require a newer API level.
 * @param {string} androidxCoreVersion
 */
function ensureCompileSdkForAndroidX(androidxCoreVersion) {
  const [major = 0, minor = 0] = String(androidxCoreVersion).split('.').map(Number);
  let requiredCompileSdk = 36;
  if (major > 1 || (major === 1 && minor >= 19)) {
    requiredCompileSdk = 37;
  }

  const { compileSdk } = readSdkVersions();
  if (compileSdk >= requiredCompileSdk) return;

  patchVariableNumericVersion('compileSdkVersion', requiredCompileSdk);
  console.log(
    `compileSdkVersion -> ${requiredCompileSdk} (androidx.core:core-ktx:${androidxCoreVersion} requires API ${requiredCompileSdk}+)`,
  );
}

/** AGP 9+ requires literal compileSdk/minSdk/targetSdk in app/build.gradle. */
function ensureExplicitSdkVersions() {
  const { compileSdk, targetSdk, minSdk } = readSdkVersions();
  let contents = applyCompileSdkLine(readFileSync(appGradle, 'utf8'), compileSdk);
  contents = contents.replace(
    /minSdkVersion rootProject\.ext\.minSdkVersion/,
    `minSdk ${minSdk}`,
  );
  contents = contents.replace(
    /targetSdkVersion rootProject\.ext\.targetSdkVersion/,
    `targetSdk ${targetSdk}`,
  );
  writeFileSync(appGradle, contents);
}

/**
 * @param {string} contents
 * @param {{ compileSdk: number, targetSdk: number, minSdk: number }} sdk
 */
function patchGradleContentsForAgp9(contents, sdk) {
  let next = contents;
  next = next.replace(/^apply plugin: 'kotlin-android'\s*\n/m, '');
  next = next.replace(/^apply plugin: 'org\.jetbrains\.kotlin\.android'\s*\n/m, '');
  next = applyCompileSdkLine(next, sdk.compileSdk);
  next = next.replace(
    /minSdkVersion project\.hasProperty\('minSdkVersion'\)\s*\?\s*rootProject\.ext\.minSdkVersion\s*:\s*\d+/g,
    `minSdk ${sdk.minSdk}`,
  );
  next = next.replace(
    /minSdkVersion rootProject\.ext\.minSdkVersion/g,
    `minSdk ${sdk.minSdk}`,
  );
  next = next.replace(
    /targetSdkVersion project\.hasProperty\('targetSdkVersion'\)\s*\?\s*rootProject\.ext\.targetSdkVersion\s*:\s*\d+/g,
    `targetSdk ${sdk.targetSdk}`,
  );
  next = next.replace(
    /targetSdkVersion rootProject\.ext\.targetSdkVersion/g,
    `targetSdk ${sdk.targetSdk}`,
  );
  next = next.replace(/\s*classpath "org\.jetbrains\.kotlin:kotlin-gradle-plugin:\$kotlin_version"\n?/g, '\n');
  next = next.replace(/\s*classpath 'org\.jetbrains\.kotlin:kotlin-gradle-plugin:[^']+'\n?/g, '\n');
  return next;
}

function discoverAndroidModuleGradleFiles() {
  /** @type {string[]} */
  const files = [
    appGradle,
    resolve(androidRoot, 'capacitor-cordova-android-plugins/build.gradle'),
  ];

  const settingsPath = resolve(androidRoot, 'capacitor.settings.gradle');
  if (existsSync(settingsPath)) {
    const settings = readFileSync(settingsPath, 'utf8');
    for (const match of settings.matchAll(/projectDir\s*=\s*new\s+File\('([^']+)'\)/g)) {
      const gradleFile = resolve(androidRoot, join(match[1], 'build.gradle'));
      if (existsSync(gradleFile)) files.push(gradleFile);
    }
  }

  return [...new Set(files)];
}

function patchAllAndroidModulesForAgp9() {
  const sdk = readSdkVersions();
  for (const gradleFile of discoverAndroidModuleGradleFiles()) {
    const before = readFileSync(gradleFile, 'utf8');
    const after = patchGradleContentsForAgp9(before, sdk);
    if (after !== before) {
      writeFileSync(gradleFile, after);
      console.log(`AGP 9 compat: patched ${gradleFile}`);
    }
  }
}

function ensureKotlinClasspath(version) {
  let contents = readFileSync(projectGradle, 'utf8');
  const line = `        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:${version}'`;
  if (contents.includes('kotlin-gradle-plugin')) {
    contents = contents.replace(
      /classpath 'org\.jetbrains\.kotlin:kotlin-gradle-plugin:[^']+'/,
      `classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:${version}'`,
    );
  } else {
    contents = contents.replace(
      /classpath 'com\.android\.tools\.build:gradle:[^']+'/,
      (match) => `${match}\n${line}`,
    );
  }
  writeFileSync(projectGradle, contents);
}

function ensureKotlinAndroidPluginForLegacyAgp() {
  let contents = readFileSync(appGradle, 'utf8');
  if (/kotlin-android|org\.jetbrains\.kotlin\.android/.test(contents)) return;
  contents = `apply plugin: 'kotlin-android'\n${contents}`;
  writeFileSync(appGradle, contents);
}

function patchAppDependencyVersions({ kotlin, okhttp, securityCrypto }, agpMajor) {
  let contents = readFileSync(appGradle, 'utf8');

  if (agpMajor >= 9) {
    // AGP built-in Kotlin + root KGP classpath supplies a matching stdlib automatically.
    contents = contents.replace(/\s*implementation "org\.jetbrains\.kotlin:kotlin-stdlib:[^"]+"\n?/g, '\n');
  } else if (contents.includes('kotlin-stdlib')) {
    contents = contents.replace(
      /org\.jetbrains\.kotlin:kotlin-stdlib:[^"]+/,
      `org.jetbrains.kotlin:kotlin-stdlib:${kotlin}`,
    );
  } else {
    contents = contents.replace(
      /dependencies \{/,
      `dependencies {\n    implementation "org.jetbrains.kotlin:kotlin-stdlib:${kotlin}"`,
    );
  }

  if (contents.includes('okhttp')) {
    contents = contents.replace(/com\.squareup\.okhttp3:okhttp:[^"]+/, `com.squareup.okhttp3:okhttp:${okhttp}`);
  } else {
    contents = contents.replace(
      /dependencies \{/,
      `dependencies {\n    implementation "com.squareup.okhttp3:okhttp:${okhttp}"`,
    );
  }

  if (contents.includes('security-crypto')) {
    contents = contents.replace(
      /androidx\.security:security-crypto:[^"]+/,
      `androidx.security:security-crypto:${securityCrypto}`,
    );
  } else {
    contents = contents.replace(
      /dependencies \{/,
      `dependencies {\n    implementation "androidx.security:security-crypto:${securityCrypto}"`,
    );
  }

  writeFileSync(appGradle, contents);
}

function requireAndroidTree() {
  for (const filePath of [projectGradle, appGradle, variablesGradle, wrapperProps]) {
    if (!existsSync(filePath)) {
      console.error(`Missing ${filePath}. Run npx cap add android first.`);
      process.exit(1);
    }
  }
}

requireAndroidTree();

const resolved = {};

resolved.gradle = await fetchLatestStableGradle();
console.log(`Gradle stable: ${resolved.gradle.version}`);

const [
  agp,
  googleServices,
  kotlin,
  okhttp,
  securityCrypto,
  cordovaAndroidVersion,
  ...variableVersions
] = await Promise.all([
  fetchLatestStableMavenVersion('com.android.tools.build', 'gradle'),
  fetchLatestStableMavenVersion('com.google.gms', 'google-services'),
  fetchLatestStableMavenVersion('org.jetbrains.kotlin', 'kotlin-gradle-plugin', 'central'),
  fetchLatestStableMavenVersion('com.squareup.okhttp3', 'okhttp', 'central'),
  fetchLatestStableMavenVersion('androidx.security', 'security-crypto'),
  fetchLatestNpmVersion('cordova-android'),
  ...Object.values(VARIABLE_COORDS).map((coords) =>
    fetchLatestStableMavenVersion(coords.group, coords.artifact, coords.repo || 'google'),
  ),
]);

resolved.agp = agp;
resolved.googleServices = googleServices;
resolved.kotlin = kotlin;
resolved.okhttp = okhttp;
resolved.securityCrypto = securityCrypto;
resolved.cordovaAndroidVersion = cordovaAndroidVersion;

console.log(`AGP stable: ${resolved.agp}`);
replaceInFile(
  projectGradle,
  /classpath 'com\.android\.tools\.build:gradle:[^']+'/,
  `classpath 'com.android.tools.build:gradle:${resolved.agp}'`,
);

console.log(`Google Services stable: ${resolved.googleServices}`);
if (!replaceInFileOptional(
  projectGradle,
  /classpath 'com\.google\.gms:google-services:[^']+'/,
  `classpath 'com.google.gms:google-services:${resolved.googleServices}'`,
)) {
  const contents = readFileSync(projectGradle, 'utf8');
  writeFileSync(
    projectGradle,
    contents.replace(
      /(classpath 'com\.android\.tools\.build:gradle:[^']+')/,
      `$1\n        classpath 'com.google.gms:google-services:${resolved.googleServices}'`,
    ),
  );
}

console.log(`Kotlin stable: ${resolved.kotlin}`);
const agpMajor = Number(String(resolved.agp).split('.')[0] || 0);
console.log(
  agpMajor >= 9
    ? `AGP ${resolved.agp}: built-in Kotlin — upgrading KGP to ${resolved.kotlin}`
    : `AGP ${resolved.agp}: applying Kotlin Gradle plugin ${resolved.kotlin}`,
);
ensureKotlinClasspath(resolved.kotlin);
if (agpMajor < 9) {
  ensureKotlinAndroidPluginForLegacyAgp();
}

Object.keys(VARIABLE_COORDS).forEach((key, index) => {
  const version = variableVersions[index];
  resolved[key] = version;
  patchVariableVersion(key, version);
  console.log(`${key}: ${version}`);
});

patchVariableVersion('cordovaAndroidVersion', resolved.cordovaAndroidVersion);
console.log(`cordovaAndroidVersion: ${resolved.cordovaAndroidVersion}`);

ensureCompileSdkForAndroidX(resolved.androidxCoreVersion);

console.log(`okhttp stable: ${resolved.okhttp}`);
console.log(`security-crypto stable: ${resolved.securityCrypto}`);
patchAppDependencyVersions({
  kotlin: resolved.kotlin,
  okhttp: resolved.okhttp,
  securityCrypto: resolved.securityCrypto,
}, agpMajor);

if (agpMajor >= 9) {
  patchAllAndroidModulesForAgp9();
} else {
  ensureExplicitSdkVersions();
}

patchWrapperProperties(resolved.gradle.downloadUrl);
try {
  refreshGradleWrapper(resolved.gradle.version);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.warn(
    `gradlew wrapper refresh skipped (${message}); distributionUrl already targets Gradle ${resolved.gradle.version}.`,
  );
}

console.log('Android build dependencies upgraded to latest stable releases.');
console.log(JSON.stringify(resolved, null, 2));
