// Anikoto lookup helper. Not part of the extension — this is the tool for finding the
// slug, MAL ID and AniList ID of a series when adding a new subtitle to catalog.json.
//
//   node scripts/anikoto.mjs "Liar Game"           search by title
//   node scripts/anikoto.mjs --slug liar-game-kcq5v 24   inspect a series/episode
import {parseHTML} from 'linkedom';

const ORIGIN = 'https://anikototv.to';
const MAX_BYTES = 4 * 1024 * 1024;
const clean = node => node?.textContent.replace(/\s+/g, ' ').trim() || '';

export function imageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, ORIGIN);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

async function boundedText(response, maxBytes = MAX_BYTES) {
  if (!response.body) return '';
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, text = '';
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error('Anikoto response is too large.'); }
      text += decoder.decode(value, {stream: true});
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

export function parseCatalog(html) {
  const {document} = parseHTML(html), seen = new Set(), items = [];
  for (const card of document.querySelectorAll('.ani.items .item')) {
    const anchor = card.querySelector('a.name') || card.querySelector('a[href]');
    const slug = anchor?.getAttribute('href')?.match(/\/watch\/([a-z0-9-]+)/)?.[1];
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    items.push({
      slug,
      title: clean(anchor),
      // The romaji/Japanese title Anikoto stores alongside the English one. Subtitle
      // filenames are romaji, so this is what actually makes automatic matching work.
      jp: anchor?.getAttribute('data-jp') || '',
      poster: imageUrl(card.querySelector('img')?.getAttribute('src')),
      sub: clean(card.querySelector('.ep-status.sub')),
      dub: clean(card.querySelector('.ep-status.dub')),
      type: clean(card.querySelector('.poster .right'))
    });
  }
  return {items};
}

export function parseAnime(html, slug) {
  const {document} = parseHTML(html), info = document.querySelector('#w-info');
  const id = document.querySelector('#watch-main')?.getAttribute('data-id');
  if (!id || !/^\d+$/.test(id) || !info) throw new Error('This anime could not be found on Anikoto.');
  const banner = document.querySelector('#player')?.getAttribute('style')?.match(/url\(['"]?([^'")]+)/)?.[1];
  return {
    id,
    slug,
    title: clean(info.querySelector('h1')),
    poster: imageUrl(info.querySelector('img')?.getAttribute('src')),
    banner: imageUrl(banner),
    anilistId: Number(banner?.match(/banner\/(\d+)/)?.[1]) || null,
    genres: [...info.querySelectorAll('a[href*="/genre/"]')].map(clean),
    sourcePage: `${ORIGIN}/watch/${slug}`
  };
}

export function parseEpisodes(html) {
  const {document} = parseHTML(html), seen = new Set();
  return [...document.querySelectorAll('a[data-num][data-ids]')].flatMap(anchor => {
    const number = anchor.getAttribute('data-num');
    if (!/^\d+(?:\.\d+)?$/.test(number) || seen.has(number)) return [];
    seen.add(number);
    return [{
      number,
      title: clean(anchor.querySelector('.d-title')) || `Episode ${number}`,
      malId: Number(anchor.getAttribute('data-mal')) || null,
      sub: anchor.getAttribute('data-sub') === '1',
      dub: anchor.getAttribute('data-dub') === '1'
    }];
  }).sort((a, b) => Number(a.number) - Number(b.number));
}

export async function request(path, fetcher = fetch) {
  const response = await fetcher(ORIGIN + path, {
    redirect: 'error',
    headers: {Referer: `${ORIGIN}/`, 'X-Requested-With': 'XMLHttpRequest'},
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Anikoto returned HTTP ${response.status}.`); }
  return boundedText(response);
}

export async function search(keyword, fetcher) {
  const query = new URLSearchParams({page: '1', sort: 'latest-updated', keyword: keyword.slice(0, 100)});
  return parseCatalog(await request(`/filter?${query}`, fetcher)).items;
}

export async function getAnime(slug, fetcher) {
  const anime = parseAnime(await request(`/watch/${slug}`, fetcher), slug);
  const data = JSON.parse(await request(`/ajax/episode/list/${anime.id}?style=1&vrf=`, fetcher));
  if (data.status !== 200 || typeof data.result !== 'string') throw new Error('Anikoto could not load the episode list.');
  return {...anime, episodes: parseEpisodes(data.result)};
}

// CLI
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('anikoto.mjs')) {
  const [first, ...rest] = process.argv.slice(2);
  if (!first) {
    console.log('usage: node scripts/anikoto.mjs "title"   |   node scripts/anikoto.mjs --slug <slug> [episode]');
  } else if (first === '--slug') {
    const anime = await getAnime(rest[0]);
    const episode = rest[1] ? anime.episodes.find(item => item.number === String(rest[1])) : null;
    console.log(JSON.stringify({
      title: anime.title, slug: anime.slug, anilistId: anime.anilistId,
      episodes: anime.episodes.length,
      episode: episode ? {number: episode.number, malId: episode.malId, sub: episode.sub} : null
    }, null, 2));
  } else {
    for (const item of (await search(first)).slice(0, 6)) {
      console.log(`${item.slug}\n    ${item.title} · ${item.type} · sub ${item.sub || '-'} · dub ${item.dub || '-'}`);
    }
  }
}
