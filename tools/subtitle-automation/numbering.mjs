// Verified series-specific mappings, never a general episode-offset guess.
//
// Each rule pins one release title to one Anikoto series. project.mjs re-checks the
// returned title, MAL ID and episode against live Anikoto on every run, so a rule can
// only ever skip the *search*, never the verification.

// Official second-cour release: episodes 13-24 are Part 2 episodes 1-12.
// https://www.samurai-trooper.net/news/detail.php?cid=6&id=23809&offset=0
function samuraiTroopers(parsed) {
  const episode = Number(parsed.episode);
  if (parsed.title !== 'Yoroi Shin Den Samurai Troopers' ||
      (parsed.season !== null && parsed.season !== 1) ||
      !Number.isInteger(episode) || episode < 13 || episode > 24) return null;
  return {
    slug:'yoroi-shinden-samurai-troopers-part-2-14f03',
    title:'Yoroi-Shinden Samurai Troopers Part 2',
    malId:63047,
    episode:String(episode-12),
    sourceEpisode:String(episode),
    sourceTitle:parsed.title,
    part:2,
    evidence:'https://www.samurai-trooper.net/news/detail.php?cid=6&id=23809&offset=0'
  };
}

// Disambiguation only -- the episode number is carried through unchanged.
// Searching "One Piece" ties the ongoing series against "One Piece: Heroines" and the
// Dr. Chopper special, all at score 1, so the search can never resolve it. The ongoing
// run is the only one of the three that numbers episodes in the thousands.
function onePiece(parsed) {
  const episode = Number(parsed.episode);
  if (parsed.title !== 'One Piece' ||
      (parsed.season !== null && parsed.season !== 1) ||
      !Number.isInteger(episode) || episode < 1000) return null;
  return {
    slug:'one-piece-odmau',
    title:'One Piece',
    malId:21,
    episode:String(episode),
    sourceEpisode:String(episode),
    sourceTitle:parsed.title,
    evidence:'https://anikototv.to/watch/one-piece-odmau'
  };
}

// Toukutsu Ou is the Japanese title for Tomb Raider King (Dogulwang)
function toukutsuOu(parsed) {
  const episode = Number(parsed.episode);
  if (parsed.title !== 'Toukutsu Ou' ||
      (parsed.season !== null && parsed.season !== 1) ||
      !Number.isInteger(episode) || episode < 1 || episode > 12) return null;
  return {
    slug:'tomb-raider-king-91d21',
    title:'Tomb Raider King',
    malId:63316,
    episode:String(episode),
    sourceEpisode:String(episode),
    sourceTitle:parsed.title,
    evidence:'https://anikototv.to/watch/tomb-raider-king-91d21'
  };
}

// Re:Zero continuous episode numbering from SubsPlease.
// Season 4 on Anikoto covers episodes 67-83 (episode 83 -> S4 episode 17).
function reZero(parsed) {
  const episode = Number(parsed.episode);
  if (parsed.title !== 'Re Zero kara Hajimeru Isekai Seikatsu' ||
      (parsed.season !== null && parsed.season !== 1) ||
      !Number.isInteger(episode)) return null;
  if (episode >= 67 && episode <= 83) {
    return {
      slug:'re-zero-starting-life-in-another-world-season-4-4hk9h',
      title:'Re:ZERO -Starting Life in Another World- Season 4',
      malId:61316,
      episode:String(episode - 66),
      sourceEpisode:String(episode),
      sourceTitle:parsed.title,
      part:4,
      evidence:'https://anikototv.to/watch/re-zero-starting-life-in-another-world-season-4-4hk9h'
    };
  }
  return null;
}

// Disambiguation between main TV series and [Mini] short
function smokingBehindTheSupermarket(parsed) {
  const episode = Number(parsed.episode);
  if (parsed.title !== 'Super no Ura de Yani Suu Futari' ||
      (parsed.season !== null && parsed.season !== 1) ||
      !Number.isInteger(episode)) return null;
  return {
    slug:'smoking-behind-the-supermarket-with-you-e086a',
    title:'Smoking Behind the Supermarket with You',
    malId:62076,
    episode:String(episode),
    sourceEpisode:String(episode),
    sourceTitle:parsed.title,
    evidence:'https://anikototv.to/watch/smoking-behind-the-supermarket-with-you-e086a'
  };
}

// Title spelling difference: SubsPlease "Otome Kaijuu Carameliser" vs Anikoto "KAIJU GIRL CARAMELISE" (jp: Otome Kaijuu Caramelise)
function kaijuGirlCaramelise(parsed) {
  const episode = Number(parsed.episode);
  if (parsed.title !== 'Otome Kaijuu Carameliser' ||
      (parsed.season !== null && parsed.season !== 1) ||
      !Number.isInteger(episode)) return null;
  return {
    slug:'kaiju-girl-caramelise',
    title:'KAIJU GIRL CARAMELISE',
    malId:63150,
    episode:String(episode),
    sourceEpisode:String(episode),
    sourceTitle:parsed.title,
    evidence:'https://anikototv.to/watch/kaiju-girl-caramelise'
  };
}

function bungoStrayDogsWan2(parsed) {
  const episode = Number(parsed.episode);
  if (!/^Bungou? Stray Dogs Wan!?/i.test(parsed.title) ||
      !Number.isInteger(episode)) return null;
  return {
    slug:'bungo-stray-dogs-wan-2',
    title:'Bungo Stray Dogs WAN! 2',
    malId:62883,
    episode:String(episode),
    sourceEpisode:String(episode),
    sourceTitle:parsed.title,
    evidence:'https://anikototv.to/watch/bungo-stray-dogs-wan-2'
  };
}

const RULES = [samuraiTroopers, onePiece, toukutsuOu, reZero, smokingBehindTheSupermarket, kaijuGirlCaramelise, bungoStrayDogsWan2];

export function knownNumbering(parsed) {
  for (const rule of RULES) {
    const result = rule(parsed);
    if (result) return result;
  }
  return null;
}
