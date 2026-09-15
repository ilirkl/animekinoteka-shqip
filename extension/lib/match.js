// Matching an Anikoto watch page to a subtitle entry.
// Keys are tried most-stable first: MAL and AniList IDs survive the site re-slugging
// a series, so a slug match is only the last resort.
export function episodeKey(value) {
  // Strict: '' and null coerce to 0 through Number(), which would silently match
  // episode 0 and serve the wrong subtitle file.
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  return /^\d+(?:\.\d+)?$/.test(text) ? String(Number(text)) : null;
}
export function entryKeys(entry) {
  const episode = episodeKey(entry?.episode);
  if (!episode) return [];
  const keys = [];
  if (entry.malId) keys.push(`mal:${entry.malId}:${episode}`);
  if (entry.anilistId) keys.push(`ani:${entry.anilistId}:${episode}`);
  for (const slug of entry.slugs || []) if (slug) keys.push(`slug:${slug}:${episode}`);
  return keys;
}
export function buildIndex(index) {
  const map = new Map();
  for (const entry of index?.entries || []) {
    if (!entry?.file) continue;
    for (const key of entryKeys(entry)) if (!map.has(key)) map.set(key, entry);
  }
  return map;
}
export function lookup(map, {malId, anilistId, slug, episode} = {}) {
  const key = episodeKey(episode);
  if (!key) return null;
  for (const candidate of [malId && `mal:${malId}:${key}`, anilistId && `ani:${anilistId}:${key}`, slug && `slug:${slug}:${key}`]) {
    if (candidate && map.has(candidate)) return map.get(candidate);
  }
  return null;
}
