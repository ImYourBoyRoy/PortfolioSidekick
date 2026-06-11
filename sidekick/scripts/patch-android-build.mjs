// ./sidekick/scripts/patch-android-build.mjs
/**
 * Patch Capacitor android/app/build.gradle with semver versionCode/versionName
 * and optional release signing config for consistent sideload upgrades.
 *
 * Run after `npx cap sync android` in CI or locally.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCompileSdkLine } from './lib/androidSdkGradle.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sidekickRoot = resolve(__dirname, '..');
const appVersionPath = resolve(sidekickRoot, 'src/lib/appVersion.js');
const buildGradlePath = resolve(sidekickRoot, 'android/app/build.gradle');
const rootGradlePath = resolve(sidekickRoot, 'android/build.gradle');
const variablesGradlePath = resolve(sidekickRoot, 'android/variables.gradle');
const androidRoot = resolve(sidekickRoot, 'android');
const capacitorSettingsPath = resolve(androidRoot, 'capacitor.settings.gradle');

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

function readSdkVersions() {
  if (!existsSync(variablesGradlePath)) {
    return { compileSdk: 37, targetSdk: 36, minSdk: 24 };
  }
  const src = readFileSync(variablesGradlePath, 'utf8');
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

/** AGP 9+ requires literal compileSdk/minSdk/targetSdk in app/build.gradle. */
function ensureExplicitSdkVersions(gradle) {
  const { compileSdk, targetSdk, minSdk } = readSdkVersions();
  let next = applyCompileSdkLine(gradle, compileSdk);
  next = next.replace(
    /minSdkVersion rootProject\.ext\.minSdkVersion/,
    `minSdk ${minSdk}`,
  );
  next = next.replace(
    /targetSdkVersion rootProject\.ext\.targetSdkVersion/,
    `targetSdk ${targetSdk}`,
  );
  return next;
}

function discoverAndroidModuleGradleFiles() {
  /** @type {string[]} */
  const files = [
    buildGradlePath,
    resolve(androidRoot, 'capacitor-cordova-android-plugins/build.gradle'),
  ];

  if (existsSync(capacitorSettingsPath)) {
    const settings = readFileSync(capacitorSettingsPath, 'utf8');
    for (const match of settings.matchAll(/projectDir\s*=\s*new\s+File\('([^']+)'\)/g)) {
      const gradleFile = resolve(androidRoot, join(match[1], 'build.gradle'));
      if (existsSync(gradleFile)) files.push(gradleFile);
    }
  }

  return [...new Set(files)];
}

function detectJavaMajor() {
  const { stdout, stderr } = spawnSync('java', ['-version'], { encoding: 'utf8' });
  const text = `${stderr || ''}${stdout || ''}`;
  const match = text.match(/version "(\d+)/);
  return match ? Number(match[1]) : 21;
}

function ensureGradleJavaHome(javaMajor) {
  const propsPath = resolve(androidRoot, 'gradle.properties');
  if (!existsSync(propsPath)) return;
  const javaHome = process.env.JAVA_HOME;
  if (!javaHome) return;
  const normalizedHome = javaHome.replace(/\\/g, '/');
  let lines = readFileSync(propsPath, 'utf8').split('\n');
  lines = lines.filter((line) => !line.startsWith('org.gradle.java.home='));
  lines.push(`org.gradle.java.home=${normalizedHome}`);
  writeFileSync(propsPath, `${lines.join('\n').trimEnd()}\n`);
  console.log(`gradle.properties: org.gradle.java.home -> ${normalizedHome} (Java ${javaMajor})`);
}

function patchJvmToolchainMajor() {
  const major = detectJavaMajor();
  if (major < 21) {
    console.warn(`Java ${major} detected; Android build expects JDK 21+.`);
    return;
  }
  ensureGradleJavaHome(major);
  for (const gradleFile of discoverAndroidModuleGradleFiles()) {
    const before = readFileSync(gradleFile, 'utf8');
    const after = before.replace(/jvmToolchain\(\d+\)/g, `jvmToolchain(${major})`);
    if (after !== before) {
      writeFileSync(gradleFile, after);
      console.log(`jvmToolchain ${major}: patched ${gradleFile}`);
    }
  }
}

function patchAllAndroidModuleCompileSdk() {
  const { compileSdk } = readSdkVersions();
  for (const gradleFile of discoverAndroidModuleGradleFiles()) {
    const before = readFileSync(gradleFile, 'utf8');
    const after = applyCompileSdkLine(before, compileSdk);
    if (after !== before) {
      writeFileSync(gradleFile, after);
      console.log(`compileSdk ${compileSdk}: patched ${gradleFile}`);
    }
  }
}

/** Silence Kotlin warnings in Capacitor node_modules plugins (upstream deprecations). */
function ensureCapacitorKotlinWarningSilence(gradle) {
  if (gradle.includes('sidekickCapacitorKotlinWarningsSilenced')) return gradle;
  return `${gradle.trimEnd()}

// sidekickCapacitorKotlinWarningsSilenced — Capacitor plugin sources live in node_modules.
subprojects { sub ->
    if (sub.projectDir.absolutePath.contains("node_modules")) {
        sub.tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
            compilerOptions {
                suppressWarnings.set(true)
            }
        }
    }
}
`;
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
gradle = ensureExplicitSdkVersions(gradle);

writeFileSync(buildGradlePath, gradle);
patchAllAndroidModuleCompileSdk();
patchJvmToolchainMajor();

if (existsSync(rootGradlePath)) {
  let rootGradle = readFileSync(rootGradlePath, 'utf8');
  rootGradle = ensureCapacitorKotlinWarningSilence(rootGradle);
  writeFileSync(rootGradlePath, rootGradle);
}

console.log(`Patched Android build: versionName=${versionName} versionCode=${versionCode}`);
