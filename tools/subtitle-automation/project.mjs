import {readFile, writeFile, mkdir, copyFile, access, rename} from 'node:fs/promises';
import {resolve, join, basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {knownNumbering} from './numbering.mjs';

const [projectArg, command, argument] = process.argv.slice(2);
const project = resolve(projectArg);
const repo = join(project, 'subtitle-repo');
const load = async path => JSON.parse(await readFile(path, 'utf8'));
const atomic = async (path, value) => {
  await writeFile(path + '.tmp', JSON.stringify(value, null, 2) + '\n');
  await rename(path + '.tmp', path);
};
const git = (...args) => execFileSync('git', ['-c', `safe.directory=${repo.replaceAll('\\', '/')}`, '-C', repo, ...args], {encoding:'utf8'}).trim();
const {search, getAnime} = await import(pathToFileURL(join(project, 'scripts/anikoto.mjs')));
const {parseFilename, pickBest, searchQueries} = await import(pathToFileURL(join(project, 'scripts/lib/match-title.mjs')));
const {parseSubtitles, toVtt} = await import(pathToFileURL(join(project, 'extension/lib/subtitles.js')));

function seasons(candidate) {
  const text = `${candidate.title} ${candidate.jp || ''}`.toLowerCase();
  const numbers = [...text.matchAll(/season\s*(\d+)|\b(\d+)(?:st|nd|rd|th)\s*season\b|\bs(\d+)\b/g)].map(m => Number(m[1] || m[2] || m[3]));
  for (const [i, word] of ['first','second','third','fourth','fifth','sixth'].entries()) if (text.includes(`${word} season`)) numbers.push(i+1);
  return [...new Set(numbers.length ? numbers : [1])];
}
const duplicate = (entries, match) => entries.find(e => String(e.episode) === String(match.episode) && (
  (e.malId && match.malId && String(e.malId) === String(match.malId)) ||
  (e.anilistId && match.anilistId && String(e.anilistId) === String(match.anilistId)) ||
  e.slug === match.slug || e.slugs?.includes(match.slug)));

// Anikoto carries no AniList id of its own: parseAnime digs one out of the
// banner image URL, so any title whose player has no banner - One Piece and
// Mushoku Tensei among them - yields null, and consumers that join on AniList
// id never see the entry. The episode's malId comes from a data attribute and
// is reliable, so resolve through anilili-metadata's mal mapping instead.
// Best-effort on purpose: any failure leaves null, exactly as before, because a
// missing id is a degraded entry while a throw here would block the release.
const anilistIdFromMal = async malId => {
  if (!malId) return null;
  try {
    const bucket = String(malId).slice(0, -3) || '0';
    const response = await fetch(
      `https://cdn.jsdelivr.net/gh/pommieyewear/anilili-metadata@main/data/mappings/mal/${bucket}/${malId}.json`,
      {signal: AbortSignal.timeout(15000)});
    if (!response.ok) { await response.body?.cancel(); return null; }
    return Number((await response.json()).anilist_id) || null;
  } catch { return null; }
};

// Last resort, for a title the mal mapping does not cover: Anime Tosho's own
// series page, and only when it names exactly one AniList entry.
//
// AniDB files a long-running show's movies and specials under a single series
// id, and the page then links every AniList entry belonging to it - fifteen for
// One Piece, whose first is a one-episode special rather than the series. There
// is nothing in the markup that marks which one is the show, so more than one
// link is treated as no answer: a null here degrades an entry, where guessing
// would attach a season of subtitles to the wrong title and say nothing.
const anilistIdFromSeriesPage = async anidbId => {
  if (!anidbId) return null;
  try {
    const response = await fetch(`https://animetosho.xyz/series/${anidbId}`, {signal: AbortSignal.timeout(15000)});
    if (!response.ok) { await response.body?.cancel(); return null; }
    const ids = new Set([...(await response.text()).matchAll(/https:\/\/anilist\.co\/anime\/(\d+)/g)].map(m => m[1]));
    return ids.size === 1 ? Number([...ids][0]) || null : null;
  } catch { return null; }
};

async function match(filename) {
  const parsed = parseFilename(filename);
  if (!parsed) throw Error('Unrecognized release filename');
  const catalog = await load(join(project, 'catalog.json'));
  const existing = catalog.find(e => basename(e.subtitle) === filename);
  if (existing) return {duplicate:true, id:existing.id};
  const numbered = knownNumbering(parsed);
  if (numbered) {
    const anime = await getAnime(numbered.slug);
    if (anime.title !== numbered.title)
      throw Error('Verified numbering no longer agrees with live Anikoto metadata');
    const episode = anime.episodes.find(e => String(e.number) === numbered.episode && e.sub);
    if (!episode)
      throw Error(`No subtitled episode ${numbered.episode} in ${numbered.slug}; episode not available yet on Anikoto`);
    if (Number(episode.malId) !== numbered.malId)
      throw Error('Verified numbering no longer agrees with live Anikoto metadata');
    const result = {filename,title:anime.title,episode:numbered.episode,season:1,part:numbered.part,
      sourceEpisode:numbered.sourceEpisode,sourceTitle:numbered.sourceTitle,numberingEvidence:numbered.evidence,
      slug:anime.slug,malId:episode.malId,anilistId:anime.anilistId ?? null,sourcePage:anime.sourcePage,
      score:1,margin:1};
    const index = await load(join(repo,'index.json'));
    const already = duplicate(catalog,result) || duplicate(index.entries,result);
    return already ? {duplicate:true,id:already.id} : result;
  }
  const seen = new Map();
  for (const query of searchQueries(parsed.title)) {
    // A failed query could hide the competing season. Fail closed and retry next hour.
    for (const item of await search(query)) seen.set(item.slug, item);
  }
  const selected = pickBest(parsed, [...seen.values()], {minScore:0.8,minMargin:0.12});
  if (!selected.confident) throw Error('Ambiguous series: ' + JSON.stringify(selected.ranked.slice(0,3)));
  const candidate = selected.best.candidate;
  const foundSeasons = seasons(candidate);
  if (foundSeasons.length !== 1 || foundSeasons[0] !== (parsed.season || 1)) throw Error('Season does not match');
  if (/\b(?:part|cour)\s*[2-9]\b/i.test(`${candidate.title} ${candidate.jp}`) && !/\b(?:part|cour)\s*[2-9]\b/i.test(parsed.title)) throw Error('Split cour requires an explicit numbering decision');
  const anime = await getAnime(candidate.slug);
  const episode = anime.episodes.find(e => String(e.number) === parsed.episode && e.sub);
  if (!episode) throw Error(`No subtitled episode ${parsed.episode} in ${candidate.slug}; never infer episode offsets`);
  if (!episode.malId && !anime.anilistId) throw Error('No stable series identifier');
  const result = {filename, title:anime.title, episode:parsed.episode, season:parsed.season || 1,
    slug:candidate.slug, malId:episode.malId ?? null, anilistId:anime.anilistId ?? null,
    sourcePage:anime.sourcePage, score:selected.best.score, margin:selected.margin};
  const index = await load(join(repo, 'index.json'));
  const already = duplicate(catalog, result) || duplicate(index.entries, result);
  return already ? {duplicate:true,id:already.id} : result;
}

async function publish(folder) {
  folder = resolve(folder);
  const expected = join(project, '.subtitle-automation');
  if (!folder.startsWith(expected + '\\') && !folder.startsWith(expected + '/')) throw Error('Unexpected queue folder');
  if (git('remote','get-url','origin').replace(/\.git$/, '') !== 'https://github.com/ilirkl/animekinoteka-shqip') throw Error('Unexpected Git remote');
  if (git('branch','--show-current') !== 'main') throw Error('Expected main branch');
  const journalPath = join(folder, 'publication.json');
  let journal;
  try { await access(journalPath); journal = await load(journalPath); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const clean = () => { if (git('status','--porcelain')) throw Error('Repository has pending edits; inspect before publishing'); };
  if (journal?.commit) {
    clean();
    if (git('rev-parse','HEAD') !== journal.commit) throw Error('Publication recovery needs review: HEAD changed');
    git('push','origin','HEAD:main');
    if (git('ls-remote','origin','refs/heads/main').split(/\s/)[0] !== journal.commit) throw Error('Remote verification failed');
    return {commit:journal.commit};
  }
  if (journal) throw Error('Interrupted publication before commit: inspect publication.json and recover; do not overwrite');
  clean();
  git('fetch','origin','main');
  if (git('rev-list','--count','origin/main..HEAD') !== '0') throw Error('Unpublished local commits need review');
  git('merge','--ff-only','origin/main');
  const savedMatch = await load(join(folder, 'match.json'));
  const fresh = await match(savedMatch.filename);
  if (fresh.duplicate) throw Error('Episode already exists; do not overwrite');
  for (const key of ['slug','episode','malId','anilistId']) if (fresh[key] !== savedMatch[key]) throw Error('Series match changed during translation');
  // After the guard above, never before: both sides of that comparison must stay
  // the raw scrape, or a resolved id here would read as a changed match against
  // the null saved at match time and fail every affected release.
  fresh.anilistId ??= await anilistIdFromMal(fresh.malId);
  fresh.anilistId ??= await anilistIdFromSeriesPage(savedMatch.anidbId);
  const releaseId = basename(folder);
  if (!/^\d+$/.test(releaseId)) throw Error('Invalid release ID');
  const id = `at-${releaseId}`;
  const assFile = `ass/${id}.sq.ass`, file = `files/${id}.sq.vtt`;
  const catalog = await load(join(project, 'catalog.json'));
  const index = await load(join(repo, 'index.json'));
  if (catalog.some(e=>e.id===id) || index.entries.some(e=>e.id===id)) throw Error('Entry ID collision');
  const raw = await readFile(join(folder, 'translated.sq.ass'));
  const cues = parseSubtitles(raw.toString('utf8'), 'translated.ass');
  if (!cues.length) throw Error('No displayable subtitle cues');
  const entry = {id,title:fresh.title,episode:Number(fresh.episode),season:fresh.season,
    subtitle:`/subtitles/${id}.sq.ass`,sourcePage:fresh.sourcePage,streamUrl:null,offset:0,
    matchStatus:'Anikoto series and episode verified; original SubsPlease timing preserved; playback offset unverified',
    slug:fresh.slug,malId:fresh.malId,anilistId:fresh.anilistId};
  const publicEntry = {id,title:entry.title,episode:fresh.episode,malId:entry.malId,anilistId:entry.anilistId,
    slugs:[entry.slug],file,assFile,offset:0,sourceReleaseId:releaseId};
  if (fresh.sourceEpisode) {
    for (const key of ['sourceEpisode','sourceTitle','part','numberingEvidence']) {
      entry[key] = fresh[key];
      publicEntry[key] = fresh[key];
    }
  }
  journal = {base:git('rev-parse','HEAD'), paths:[file,assFile,'index.json'], entry, publicEntry};
  await atomic(journalPath, journal);
  await mkdir(join(repo,'ass'), {recursive:true});
  await mkdir(join(repo,'files'), {recursive:true});
  await mkdir(join(project,'subtitles'), {recursive:true});
  await writeFile(join(repo, assFile), raw, {flag:'wx'});
  await writeFile(join(repo, file), toVtt(cues,0), {flag:'wx'});
  await writeFile(join(project,entry.subtitle.slice(1)), raw, {flag:'wx'});
  catalog.push(entry);
  await atomic(join(project,'catalog.json'),catalog);
  index.entries.push(publicEntry);
  index.updated = new Date().toISOString().slice(0,10);
  await atomic(join(repo,'index.json'),index);
  git('add','--', ...journal.paths);
  const staged = git('diff','--cached','--name-only').split(/\r?\n/).sort();
  if (JSON.stringify(staged) !== JSON.stringify([...journal.paths].sort())) throw Error('Unexpected staged files');
  git('-c','user.name=ilirkl','-c','user.email=ilirkl@gmail.com','commit','-m',`Add Albanian subtitles: ${fresh.title} episode ${fresh.episode}`);
  journal.commit = git('rev-parse','HEAD');
  await atomic(journalPath,journal);
  git('push','origin','HEAD:main');
  if (git('ls-remote','origin','refs/heads/main').split(/\s/)[0] !== journal.commit) throw Error('Remote verification failed');
  return {commit:journal.commit};
}

try {
  const result = command === 'match' ? await match(argument) : command === 'publish' ? await publish(argument) : (()=>{throw Error('Unknown command');})();
  console.log(JSON.stringify(result));
} catch(error) { console.error(error.message); process.exitCode=1; }
