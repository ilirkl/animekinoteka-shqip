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

// Word boundaries disagree between the two sources. Anikoto writes "BanG Dream! Yume∞Mita",
// where the symbol tokenises as a separator and yields yume+mita, while the release writes
// "Yumemita" as one word. Matching runs of up to three adjacent tokens against the other
// side's joined forms lets those line up.
const MAX_RUN = 3;

function joinedForms(tokens) {
  const forms = new Set();
  for (let start = 0; start < tokens.length; start++) {
    for (let length = 1; length <= MAX_RUN && start + length <= tokens.length; length++) {
      forms.add(tokens.slice(start, start + length).join(''));
    }
  }
  return forms;
}

// Fraction of `tokens` accounted for by `forms`, where a run of adjacent tokens counts as
// covered if its concatenation appears on the other side.
function coverage(tokens, forms) {
  if (!tokens.length) return 0;
  const covered = new Array(tokens.length).fill(false);
  for (let start = 0; start < tokens.length; start++) {
    for (let length = 1; length <= MAX_RUN && start + length <= tokens.length; length++) {
      if (!forms.has(tokens.slice(start, start + length).join(''))) continue;
      for (let i = start; i < start + length; i++) covered[i] = true;
    }
  }
  return covered.filter(Boolean).length / tokens.length;
}

// Two measures, because they fail on opposite shapes:
//   F1          — balanced when both titles are similar lengths
//   containment — a short filename title against a long official one, e.g. "Tenkosaki"
//                 against the full light-novel title, where F1 would score near zero
//
// Containment is deliberately one-directional: it only rescues the case it exists for, the
// filename title being the shorter side. Allowing it both ways let any candidate whose title
// is a strict prefix of the release score a perfect 1.0 — "BanG Dream!" beat the actual
// "BanG Dream! Yume∞Mita" that way. Even so containment matches eagerly, so pickBest still
// requires a clear margin over the runner-up before accepting anything.
export function similarity(a, b) {
  const left = tokenise(a);
  const right = tokenise(b);
  if (!left.length || !right.length) return 0;
  const leftCoverage = coverage(left, joinedForms(right));
  const rightCoverage = coverage(right, joinedForms(left));
  if (!leftCoverage || !rightCoverage) return 0;
  const f1 = (2 * leftCoverage * rightCoverage) / (leftCoverage + rightCoverage);
  const containment = left.length <= right.length ? leftCoverage : 0;
  return Math.max(f1, containment);
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
