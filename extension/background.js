import {parseSubtitles, toVtt} from './lib/subtitles.js';
import {buildIndex, lookup} from './lib/match.js';
import {DEFAULTS, baseUrlFrom} from './lib/config.js';

// Subtitles are fetched here rather than in the content script: with host_permissions
// granted, service-worker fetches are not subject to CORS, so the hosting repo needs
// no special headers.
const INDEX_TTL = 10 * 60 * 1000;
const MAX_CACHED_FILES = 40;
let indexCache = null;
const cueCache = new Map();

// Returns null when no repository is configured yet. That is an ordinary state, not a
// failure, so it must not throw — an uncaught error here would be logged on
// chrome://extensions and look like the extension is broken.
async function getIndex() {
  const base = baseUrlFrom(await chrome.storage.local.get(DEFAULTS));
  if (!base) return null;
  if (indexCache && indexCache.base === base && Date.now() - indexCache.at < INDEX_TTL) return indexCache;
  const response = await fetch(`${base}index.json`, {cache: 'no-cache'});
  if (!response.ok) throw new Error(`Subtitle index returned HTTP ${response.status}.`);
  indexCache = {map: buildIndex(await response.json()), at: Date.now(), base};
  return indexCache;
}
async function cuesFor(base, entry) {
  const url = new URL(entry.file, base).href;
  if (!url.startsWith(base)) throw new Error('Subtitle entry points outside the configured repository.');
  if (cueCache.has(url)) return cueCache.get(url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Subtitle file returned HTTP ${response.status}.`);
  const cues = parseSubtitles(await response.text(), url);
  if (!cues.length) throw new Error('That subtitle file has no readable cues.');
  if (cueCache.size >= MAX_CACHED_FILES) cueCache.clear();
  cueCache.set(url, cues);
  return cues;
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // The channel is gone if the sender navigated away; replying then throws, and throwing
  // from the catch below would surface as an unhandled rejection.
  const reply = payload => { try { sendResponse(payload); } catch {} };
  if (message?.type === 'refresh') { indexCache = null; cueCache.clear(); reply({ok: true}); return; }
  // The player iframe's host changes over time, so it cannot be a fixed manifest match.
  // The Anikoto frame reports whatever origin it actually sees and the scripts are
  // injected there at runtime.
  if (message?.type === 'embed') {
    (async () => {
      const tabId = sender.tab?.id;
      const origin = String(message.origin || '');
      if (!tabId || !/^https:\/\/[^/]+$/.test(origin)) { reply({ok: false, code: 'BAD_ORIGIN'}); return; }
      const origins = [`${origin}/*`];
      if (!(await chrome.permissions.contains({origins}))) { reply({ok: false, code: 'NEEDS_PERMISSION', origin}); return; }
      try {
        await chrome.scripting.executeScript({target: {tabId, allFrames: true}, files: ['content/inject.js'], world: 'MAIN'});
        await chrome.scripting.executeScript({target: {tabId, allFrames: true}, files: ['content/embed.js']});
        reply({ok: true, origin});
      } catch (error) { reply({ok: false, message: error.message, origin}); }
    })();
    return true;
  }
  // The full key list, so the content script can mark cards and episode links on
  // Anikoto's own pages without a lookup per item.
  if (message?.type === 'marks') {
    (async () => {
      try {
        const index = await getIndex();
        if (!index) { reply({ok: false, code: 'NOT_CONFIGURED'}); return; }
        reply({ok: true, keys: [...index.map.keys()]});
      } catch (error) { reply({ok: false, message: error.message}); }
    })();
    return true;
  }
  if (message?.type !== 'lookup') return;
  (async () => {
    try {
      const index = await getIndex();
      if (!index) { reply({ok: false, code: 'NOT_CONFIGURED'}); return; }
      const entry = lookup(index.map, message);
      if (!entry) { reply({ok: false, code: 'NO_MATCH'}); return; }
      const cues = await cuesFor(index.base, entry);
      const offset = Number(entry.offset) || 0;
      reply({
        ok: true,
        id: entry.id || entry.file,
        title: entry.title || '',
        offset,
        cues,
        // Handed to the player as a native track; the offset is baked in because a
        // track the player owns cannot be retimed after it is loaded.
        vtt: toVtt(cues, offset)
      });
    } catch (error) { reply({ok: false, message: error.message}); }
  })();
  return true;
});
