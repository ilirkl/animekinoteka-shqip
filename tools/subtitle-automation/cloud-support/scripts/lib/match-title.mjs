// Matches a subtitle filename to an Anikoto series.
//
// Subtitle files are named in romaji ("Mujikaku Seijo wa Kyou mo ... - 12.sq.ass") while
// Anikoto lists series under English titles ("The Oblivious Saint Can't Contain Her
// Power"). Comparing those two directly fails. Anikoto does carry the romaji title in a
// `data-jp` attribute, so every candidate is scored against both and the better wins.

const EXTENSION = /\.(?:sq\.)?(?:ass|ssa|srt|vtt)$/i;

// "Grand Blue S3", "Gaikotsu Kishi-sama, ... S2" — a trailing season marker.
const SEASON = /\s+S(\d{1,2})$/i;

export function parseFilename(name) {
  const base = String(name).replace(/^.*[\\/]/, '');
  const match = base.match(/^(.+?)\s*-\s*(\d+(?:\.\d+)?)\s*\.sq\.(?:ass|ssa|srt|vtt)$/i);
  if (!match) return null;
  let title = match[1].trim();
  let season = null;
  const seasonMatch = title.match(SEASON);
  if (seasonMatch) {
    season = Number(seasonMatch[1]);
    title = title.replace(SEASON, '').trim();
  }
  return {file: base, title, season, episode: String(Number(match[2]))};
}

// Romaji long vowels are written inconsistently — Anikoto has "Tenkousaki" where the
// subtitle file has "Tenkosaki", and the same happens with yuu/yu and oo/o. Collapsing
// them makes the two spellings comparable.
const collapseRomaji = word => word
  .replace(/ou/g, 'o')
  .replace(/oo/g, 'o')
  .replace(/uu/g, 'u');

export function tokenise(text) {
  return String(text || '')
    .toLowerCase()
    .replace(EXTENSION, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(collapseRomaji);
}

// Two measures, because they fail on opposite shapes:
//   Dice        — balanced when both titles are similar lengths
//   containment — a short filename title against a long official one, e.g. "Tenkosaki"
//                 against the full light-novel title, where Dice would score near zero
// Containment alone would match too eagerly, so pickBest still requires a clear margin
// over the runner-up before accepting anything.
export function similarity(a, b) {
  const left = new Set(tokenise(a));
  const right = new Set(tokenise(b));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  const dice = (2 * shared) / (left.size + right.size);
  const containment = shared / Math.min(left.size, right.size);
  return Math.max(dice, containment);
}

const ORDINALS = {2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth'};

// A season in the filename must not let "Season 2" win over "Season 3".
function seasonScore(season, candidate) {
  const text = `${candidate.title} ${candidate.jp || ''}`.toLowerCase();
  const mentions = /season\s*(\d+)|\b(\d+)(?:st|nd|rd|th)\s*season\b|\bs(\d+)\b/g;
  const found = new Set();
  for (const hit of text.matchAll(mentions)) {
    const value = Number(hit[1] || hit[2] || hit[3]);
    if (value) found.add(value);
  }
  if (!season || season === 1) return found.size && !found.has(1) ? -0.35 : 0;
  if (found.has(season)) return 0.3;
  if (ORDINALS[season] && text.includes(`${ORDINALS[season]} season`)) return 0.3;
  // A candidate with no season marker at all is the first season, which is just as wrong
  // as the wrong number. Without this, an exact match on the bare title outscores the
  // correct season entry, whose extra words dilute the similarity.
  return -0.35;
}

export function scoreCandidate(parsed, candidate) {
  const base = Math.max(
    similarity(parsed.title, candidate.jp),
    similarity(parsed.title, candidate.title)
  );
  return Math.max(0, Math.min(1, base + seasonScore(parsed.season, candidate)));
}

// Returns the best candidate plus enough context for the caller to decide whether the
// match is safe to accept without a human looking at it.
export function pickBest(parsed, candidates, {minScore = 0.55, minMargin = 0.12} = {}) {
  const ranked = candidates
    .map(candidate => ({candidate, score: scoreCandidate(parsed, candidate)}))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0] || null;
  const runnerUp = ranked[1] || null;
  const margin = best && runnerUp ? best.score - runnerUp.score : 1;
  return {
    ranked,
    best,
    runnerUp,
    margin,
    confident: Boolean(best) && best.score >= minScore && margin >= minMargin
  };
}

// Anikoto's search does better with fewer words when a full romaji title returns nothing,
// so the query is shortened progressively rather than given up on.
export function searchQueries(title) {
  const words = title.split(/\s+/).filter(Boolean);
  const queries = [title];
  for (const count of [6, 5, 4, 3, 2]) {
    if (words.length > count) queries.push(words.slice(0, count).join(' '));
  }
  return [...new Set(queries)];
}
