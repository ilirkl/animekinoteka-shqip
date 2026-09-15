// Runs in the PAGE world (not the isolated content-script world) inside the player
// iframe, at document_start. Patching from the isolated world would have no effect on
// the page's own jQuery or fetch, which is why this file is separate from embed.js.
//
// It appends one entry to the `tracks` array that stream/getSources returns, so the
// player treats the Albanian subtitle as a first-class caption track: its own menu, its
// own renderer, and it survives the player's native fullscreen.
//
// The player requests sources through jQuery.ajax, so that is the hook that actually
// fires; MegaPlay's own segment-decrypt code wraps jQuery for the same reason. Only
// `sources` is encrypted in that response — `tracks` is plain, so nothing here touches
// the encryption.
(() => {
  const log = (...args) => console.log('%c[akn:page]', 'color:#fbbf24;font-weight:bold', ...args);
  log('script loaded', {
    url: location.href,
    isTop: window.top === window,
    alreadyRunning: Boolean(window.__aknInject),
    hasJQuery: typeof window.jQuery === 'function',
    hasJwplayer: typeof window.jwplayer === 'function'
  });
  if (window.__aknInject) return;
  window.__aknInject = true;

  const SOURCES = /getSources/i;
  const WAIT_MS = 2500;
  const POLL_MS = 50;
  const MAX_POLLS = 200;
  let track = null;
  const waiting = [];

  window.addEventListener('message', event => {
    const data = event.data;
    if (!data || typeof data !== 'object' || data.akn !== 'track' || !data.file) return;
    track = {file: data.file, label: data.label || 'Albanian', kind: 'captions'};
    log('track received', {label: track.label, file: track.file, waiters: waiting.length});
    while (waiting.length) waiting.shift()();
  });

  // getSources usually fires before the subtitle has been resolved, so the callback is
  // held briefly. The timeout means a missing subtitle can never stall playback.
  function ready() {
    if (track) return Promise.resolve();
    return new Promise(resolve => {
      const timer = setTimeout(resolve, WAIT_MS);
      waiting.push(() => { clearTimeout(timer); resolve(); });
    });
  }

  const isCaption = entry => entry && (entry.kind === 'captions' || entry.kind === 'subtitles');

  function addTo(tracks) {
    if (!track || !Array.isArray(tracks)) return false;
    if (tracks.some(entry => entry && entry.file === track.file)) return false;
    // Demote the provider's own default (usually English) so Albanian is selected on
    // load. Non-caption entries such as thumbnail sprites are left untouched.
    for (const entry of tracks) if (isCaption(entry) && entry.default) entry.default = false;
    tracks.push({...track, default: true});
    return true;
  }

  function wrapJQuery(jq) {
    if (!jq || typeof jq.ajax !== 'function' || jq.__aknWrapped) return false;
    const nativeAjax = jq.ajax;
    jq.ajax = function (first, second) {
      const options = typeof first === 'object' && first ? first : (second || {});
      if (typeof first === 'string') options.url = first;
      if (!SOURCES.test(String(options.url || ''))) return nativeAjax.apply(this, arguments);
      log('intercepted getSources request', {url: String(options.url).slice(0, 160), hasTrack: Boolean(track)});
      const success = options.success;
      // Replacing success lets the track be awaited without having to hold an XHR
      // readystatechange open, which jQuery would not tolerate.
      options.success = function (data) {
        const self = this;
        const args = arguments;
        ready().then(() => {
          let added = false;
          try { added = addTo(data && data.tracks); }
          catch (error) { log('append failed', error.message); }
          log('getSources response', {
            keys: data && typeof data === 'object' ? Object.keys(data) : typeof data,
            trackCount: data && Array.isArray(data.tracks) ? data.tracks.length : 'none',
            labels: data && Array.isArray(data.tracks) ? data.tracks.map(t => t && t.label).slice(0, 8) : null,
            appended: added,
            hadTrack: Boolean(track)
          });
          if (typeof success === 'function') success.apply(self, args);
        });
      };
      return typeof first === 'object' && first
        ? nativeAjax.call(this, options)
        : nativeAjax.call(this, options.url, options);
    };
    jq.__aknWrapped = true;
    log('jQuery.ajax wrapped', {jqVersion: jq.fn && jq.fn.jquery});
    return true;
  }

  // The player is jwplayer, which renders its own captions rather than using the native
  // text tracks, so selecting the track through its API is what actually makes Albanian
  // the active one. Same instance lookup the provider's own fullscreen bridge uses.
  function getPlayer() {
    if (typeof window.jwplayer !== 'function') return null;
    try {
      const byId = window.jwplayer('megaplay-player');
      if (byId && typeof byId.getCaptionsList === 'function') return byId;
      const any = window.jwplayer();
      if (any && typeof any.getCaptionsList === 'function') return any;
    } catch {}
    return null;
  }

  let selected = false;
  function selectAlbanian() {
    if (selected || !track) return false;
    const player = getPlayer();
    if (!player) return false;
    let list;
    try { list = player.getCaptionsList() || []; } catch { return false; }
    const index = list.findIndex(item => /albanian|shqip/i.test((item && item.label) || ''));
    if (!reportedList) {
      reportedList = true;
      log('jwplayer captions list', list.map(item => item && item.label), {albanianAt: index});
    }
    if (index < 0) return false;
    try { player.setCurrentCaptions(index); } catch (error) { log('setCurrentCaptions failed', error.message); return false; }
    log('Albanian caption selected', {index});
    selected = true;
    return true;
  }
  let reportedList = false;

  let captionPolls = 0;
  const captionTimer = setInterval(() => {
    const player = getPlayer();
    if (player && !player.__aknCaptionsBound) {
      player.__aknCaptionsBound = true;
      try { player.on('captionsList', selectAlbanian); } catch {}
      try { player.on('playlistItem', () => { selected = false; }); } catch {}
    }
    if (selectAlbanian() || ++captionPolls > MAX_POLLS) clearInterval(captionTimer);
  }, POLL_MS);

  // jQuery and e1-player.min.js are back-to-back synchronous script tags, so getSources
  // is requested in the same tick jQuery appears. Polling loses that race; a setter on
  // window.jQuery wraps it the instant it is assigned instead.
  if (!wrapJQuery(window.jQuery)) {
    let held;
    try {
      Object.defineProperty(window, 'jQuery', {
        configurable: true,
        enumerable: true,
        get: () => held,
        set(value) { held = value; wrapJQuery(value); }
      });
      log('waiting for jQuery via property setter');
    } catch (error) {
      log('could not define jQuery setter, falling back to polling', error.message);
    }
    // Backstop in case another script redefines the property before jQuery lands.
    let polls = 0;
    const timer = setInterval(() => {
      if (wrapJQuery(window.jQuery) || ++polls > MAX_POLLS) clearInterval(timer);
    }, POLL_MS);
  }

  // Fallback for any build that routes sources through fetch instead of jQuery.
  const nativeFetch = window.fetch;
  window.fetch = async function (input) {
    const url = String(typeof input === 'string' ? input : input?.url || '');
    const response = await nativeFetch.apply(this, arguments);
    if (!SOURCES.test(url)) return response;
    try {
      const text = await response.clone().text();
      await ready();
      if (!track) return response;
      const data = JSON.parse(text);
      if (!addTo(data && data.tracks)) return response;
      return new Response(JSON.stringify(data), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    } catch { return response; }
  };
})();
