// Use the same runtime and request options as the working Anikoto helper.
const origin = 'https://anikototv.to';
async function page(path) {
  const response = await fetch(origin + path, {
    redirect:'error', headers:{Referer:origin+'/', 'X-Requested-With':'XMLHttpRequest'},
    signal:AbortSignal.timeout(15000)
  });
  if (!response.ok) throw Error(`Anikoto HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 4 * 1024 * 1024) throw Error('Response too large');
  return text;
}
const html = await page('/filter?page=1&sort=latest-updated&keyword=Liar+Game');
if (!html.includes('data-jp=')) throw Error('Romaji metadata unavailable');
const slug = html.match(/href=["'](?:https:\/\/anikototv\.to)?\/watch\/([a-z0-9-]+)/)?.[1];
if (!slug) throw Error('No series link');
const seriesPage = await page('/watch/' + slug);
const tag = seriesPage.match(/<[^>]+id=["']watch-main["'][^>]*>/)?.[0];
const id = tag?.match(/data-id=["'](\d+)/)?.[1];
if (!id) throw Error('Series identifier unavailable');
const episodes = JSON.parse(await page(`/ajax/episode/list/${id}?style=1&vrf=`));
if (episodes.status !== 200 || !episodes.result?.includes('data-num')) throw Error('Episodes unavailable');
console.log('Anikoto search, romaji titles, series and episode metadata reachable');
