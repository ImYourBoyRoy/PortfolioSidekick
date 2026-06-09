// ./frontend/scripts/lib/mavenLatest.mjs
/**
 * Resolve latest GA Maven artifact versions from maven-metadata.xml.
 * Ignores metadata <release>/<latest> when they point at pre-releases.
 *
 * Created by: Roy Dawson IV
 */

const GOOGLE_MAVEN = 'https://dl.google.com/dl/android/maven2';
const MAVEN_CENTRAL = 'https://repo.maven.apache.org/maven2';

const PRERELEASE_PATTERN = /(?:^|\.|-|_)(alpha|beta|rc|preview|eap|m\d+|dev)(?:\.|-|_|$)/i;
const STRICT_GA_PATTERN = /^\d+(?:\.\d+){1,3}$/;

/**
 * @param {string} version
 */
export function isStableGaVersion(version) {
  const value = String(version || '').trim();
  if (!value) return false;
  if (PRERELEASE_PATTERN.test(value)) return false;
  return STRICT_GA_PATTERN.test(value);
}

/**
 * @param {string} xml
 * @returns {string[]}
 */
export function parseMavenVersions(xml) {
  return [...String(xml).matchAll(/<version>([^<]+)<\/version>/g)].map((match) => match[1].trim());
}

/**
 * @param {string[]} versions
 * @returns {string}
 */
export function pickLatestStableVersion(versions) {
  const stable = versions.filter(isStableGaVersion);
  if (!stable.length) {
    throw new Error(`No stable GA version found in metadata (${versions.length} entries).`);
  }
  return stable[stable.length - 1];
}

/**
 * @param {string} groupId
 * @param {string} artifactId
 * @param {'google' | 'central'} [repo]
 */
export function mavenMetadataUrl(groupId, artifactId, repo = 'google') {
  const base = repo === 'central' ? MAVEN_CENTRAL : GOOGLE_MAVEN;
  const path = `${groupId.replace(/\./g, '/')}/${artifactId}/maven-metadata.xml`;
  return `${base}/${path}`;
}

/**
 * @param {string} groupId
 * @param {string} artifactId
 * @param {'google' | 'central'} [repo]
 * @returns {Promise<string>}
 */
export async function fetchLatestStableMavenVersion(groupId, artifactId, repo = 'google') {
  const url = mavenMetadataUrl(groupId, artifactId, repo);
  const response = await fetch(url, { headers: { Accept: 'application/xml,text/xml' } });
  if (!response.ok) {
    throw new Error(`Maven metadata failed for ${groupId}:${artifactId} (${response.status})`);
  }
  const xml = await response.text();
  return pickLatestStableVersion(parseMavenVersions(xml));
}

/**
 * @param {string} packageName
 * @returns {Promise<string>}
 */
export async function fetchLatestNpmVersion(packageName) {
  const url = `https://registry.npmjs.org/${packageName}/latest`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`npm registry failed for ${packageName} (${response.status})`);
  }
  const payload = await response.json();
  const version = String(payload?.version || '').trim();
  if (!version) {
    throw new Error(`npm registry returned empty version for ${packageName}.`);
  }
  return version;
}
