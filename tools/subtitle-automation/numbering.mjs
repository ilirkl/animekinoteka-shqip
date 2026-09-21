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

// SubsPlease releases this as "Bungou Stray Dogs Wan! S2", which parseFilename splits
// into title "Bungou Stray Dogs Wan!" plus season 2. Anikoto lists the spin-off's second
// season under its own slug, nowhere near the 2016 mainline "Bungo Stray Dogs 2" the
// search used to pick. The title is anchored and the season is required: an unanchored
// prefix with no season check also swallowed WAN! season 1 and filed it under season 2.
function bungoStrayDogsWan2(parsed) {
  const episode = Number(parsed.episode);
  if (!/^Bungou? Stray Dogs Wan!?$/i.test(parsed.title) ||
      parsed.season !== 2 ||
      !Number.isInteger(episode) || episode < 1) return null;
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

// Disambiguation only -- the episode number is carried through unchanged.
// SubsPlease releases this as "Link Click S3", but Anikoto files the third season under
// its Chinese title "Shiguang Dailiren III", which shares no word with the release name.
// Searching "Link Click" returns season 1, season 2, Bridon Arc, Mini and two specials
// and never this entry, so the season can only be reached by pinning it. project.mjs
// still confirms the episode exists on that series before anything is published.
function linkClickS3(parsed) {
  const episode = Number(parsed.episode);
  if (parsed.title !== 'Link Click' ||
      parsed.season !== 3 ||
      !Number.isInteger(episode) || episode < 1) return null;
  return {
    slug:'shiguang-dailiren-iii',
    title:'Shiguang Dailiren III',
    malId:61607,
    episode:String(episode),
    sourceEpisode:String(episode),
    sourceTitle:parsed.title,
    evidence:'https://anikototv.to/watch/shiguang-dailiren-iii'
  };
}

// Season title differs entirely from the release name: SubsPlease releases the fourth
// season as "Honzuki no Gekokujou S4", while Anikoto files it as "Ascendance of a Bookworm:
// Adopted Daughter of an Archduke" (Ryoushu no Youjo). Searching the release title only
// returns the earlier seasons and spin-offs at 0.65, so the season can only be reached by
// pinning it. project.mjs confirms the episode and MAL ID before anything is published.
function honzukiS4(parsed) {
  const episode = Number(parsed.episode);
  if (parsed.title !== 'Honzuki no Gekokujou' ||
      parsed.season !== 4 ||
      !Number.isInteger(episode) || episode < 1) return null;
  return {
    slug:'ascendance-of-a-bookworm-adopted-daughter-of-an-archduke-huvyk',
    title:'Ascendance of a Bookworm: Adopted Daughter of an Archduke',
    malId:57466,
    episode:String(episode),
    sourceEpisode:String(episode),
    sourceTitle:parsed.title,
    evidence:'https://anikototv.to/watch/ascendance-of-a-bookworm-adopted-daughter-of-an-archduke-huvyk'
  };
}

// Disambiguation only -- the episode number is carried through unchanged.
// SubsPlease releases the ongoing series as "Detective Conan", while Anikoto files it as
// "Case Closed"; searching returns movies and specials that likewise score 1. The ongoing
// run is the only candidate that numbers episodes in the thousands.
function detectiveConan(parsed) {
  const episode = Number(parsed.episode);
  if (parsed.title !== 'Detective Conan' ||
      (parsed.season !== null && parsed.season !== 1) ||
      !Number.isInteger(episode) || episode < 1000) return null;
  return {
    slug:'case-closed-w8ehk',
    title:'Case Closed',
    malId:235,
    episode:String(episode),
    sourceEpisode:String(episode),
    sourceTitle:parsed.title,
    evidence:'https://anikototv.to/watch/case-closed-w8ehk'
  };
}

// SubsPlease numbers the 100 Girlfriends releases continuously across seasons
// ("Hyakkano - 25" is season 2's first episode), while Anikoto files each season
// separately with 12 episodes apiece. Cumulative 25-36 therefore lands on season 3's
// episodes 1-12. project.mjs re-checks the episode and MAL ID on every run.
function hyakkanoS3(parsed) {
  const episode = Number(parsed.episode);
  if (parsed.title !== 'Hyakkano' ||
      (parsed.season !== null && parsed.season !== 1) ||
      !Number.isInteger(episode) || episode < 25 || episode > 36) return null;
  return {
    slug:'the-100-girlfriends-who-really-really-really-really-really-love-you-season-3-c0d2f',
    title:'The 100 Girlfriends Who Really, Really, Really, Really, Really Love You Season 3',
    malId:62811,
    episode:String(episode - 24),
    sourceEpisode:String(episode),
    sourceTitle:parsed.title,
    part:3,
    evidence:'https://anikototv.to/watch/the-100-girlfriends-who-really-really-really-really-really-love-you-season-3-c0d2f'
  };
}

// Erai-raws spells the season inside the title, in forms parseFilename's trailing "S<number>"
// rule cannot see ("III", "2nd Season", "- Ni"). Each rule pins one such title form to the
// Anikoto entry project.mjs then verifies episode and MAL ID against.
function mushokuTenseiIII(parsed) {
  const episode = Number(parsed.episode);
  if (parsed.title !== 'Mushoku Tensei III: Isekai Ittara Honki Dasu' ||
      (parsed.season !== null && parsed.season !== 1) ||
      !Number.isInteger(episode) || episode < 1) return null;
  return {
    slug:'mushoku-tensei-jobless-reincarnation-season-3',
    title:'Mushoku Tensei: Jobless Reincarnation Season 3',
    malId:59193,
    episode:String(episode),
    sourceEpisode:String(episode),
    sourceTitle:parsed.title,
    part:3,
    evidence:'https://anikototv.to/watch/mushoku-tensei-jobless-reincarnation-season-3'
  };
}

function magilumiereS2(parsed) {
  const episode = Number(parsed.episode);
  if (parsed.title !== 'Kabushikigaisha Magilumiere 2nd Season' ||
      (parsed.season !== null && parsed.season !== 1) ||
      !Number.isInteger(episode) || episode < 1) return null;
  return {
    slug:'kabushikigaisha-magi-lumiere-2nd-season-69ca1',
    title:'Magilumiere Magical Girls Inc. Season 2',
    malId:60552,
    episode:String(episode),
    sourceEpisode:String(episode),
    sourceTitle:parsed.title,
    part:2,
    evidence:'https://anikototv.to/watch/kabushikigaisha-magi-lumiere-2nd-season-69ca1'
  };
}

function azurLaneNi(parsed) {
  const episode = Number(parsed.episode);
  if (parsed.title !== 'Azur Lane: Bisoku Zenshin - Ni' ||
      (parsed.season !== null && parsed.season !== 1) ||
      !Number.isInteger(episode) || episode < 1) return null;
  return {
    slug:'azur-lane-slow-ahead-season-2-ac697',
    title:'Anime AzurLane: Slow Ahead! Season 2',
    malId:56613,
    episode:String(episode),
    sourceEpisode:String(episode),
    sourceTitle:parsed.title,
    part:2,
    evidence:'https://anikototv.to/watch/azur-lane-slow-ahead-season-2-ac697'
  };
}

const RULES = [samuraiTroopers, onePiece, toukutsuOu, reZero, smokingBehindTheSupermarket, kaijuGirlCaramelise, bungoStrayDogsWan2, linkClickS3, honzukiS4, detectiveConan, hyakkanoS3, mushokuTenseiIII, magilumiereS2, azurLaneNi];

export function knownNumbering(parsed) {
  for (const rule of RULES) {
    const result = rule(parsed);
    if (result) return result;
  }
  return null;
}
