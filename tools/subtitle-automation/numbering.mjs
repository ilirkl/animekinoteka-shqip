// Verified series-specific numbering, never a general episode-offset guess.
// Official second-cour release: episodes 13–24.
// https://www.samurai-trooper.net/news/detail.php?cid=6&id=23809&offset=0
export function knownNumbering(parsed) {
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
