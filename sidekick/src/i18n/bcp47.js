// ./sidekick/src/i18n/bcp47.js
/**
 * BCP 47 tag helpers — preferred casing: language lower, script Title, region UPPER.
 */

/**
 * @param {string} tag
 * @returns {string}
 */
export function toBcp47Tag(tag) {
  const parts = tag.trim().toLowerCase().split('-').filter(Boolean);
  if (parts.length === 0) return tag;
  const [language, ...rest] = parts;
  const formatted = [language];
  for (const part of rest) {
    if (part.length === 4) {
      formatted.push(part.charAt(0).toUpperCase() + part.slice(1));
    } else if (part.length === 2) {
      formatted.push(part.toUpperCase());
    } else {
      formatted.push(part);
    }
  }
  return formatted.join('-');
}
