// ./frontend/scripts/lib/androidSdkGradle.mjs
/**
 * Gradle compileSdk snippets for Capacitor Android modules.
 * API 37+ is published as platforms/android-37.0 — use CompileSdkSpec minorApiLevel.
 *
 * Created by: Roy Dawson IV
 */

/**
 * @param {number} compileSdk
 */
export function compileSdkGradleSnippet(compileSdk) {
  if (compileSdk >= 37) {
    return `compileSdk {
        version = release(${compileSdk}) {
            minorApiLevel = 0
        }
    }`;
  }
  return `compileSdk ${compileSdk}`;
}

/**
 * @param {string} gradle
 * @param {number} compileSdk
 */
export function applyCompileSdkLine(gradle, compileSdk) {
  const snippet = compileSdkGradleSnippet(compileSdk);
  let next = gradle;
  next = next.replace(
    /compileSdk\s*\{\s*\n\s*version\s*=\s*release\(\d+\)\s*\{[^}]*\}\s*\n\s*\}/,
    snippet,
  );
  next = next.replace(
    /compileSdk\s*=\s*project\.hasProperty\('compileSdkVersion'\)\s*\?\s*rootProject\.ext\.compileSdkVersion\s*:\s*\d+/g,
    snippet,
  );
  next = next.replace(/compileSdk\s*=\s*rootProject\.ext\.compileSdkVersion/g, snippet);
  next = next.replace(/compileSdk \d+/g, snippet);
  return next;
}
