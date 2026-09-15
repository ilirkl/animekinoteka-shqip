// Runs inside the player iframe. Reads the <video> element directly and reports its
// position to the Anikoto frame, so subtitle sync does not depend on whether this embed
// happens to ship its own parent bridge.
//
// MegaPlay nests a second same-origin iframe inside the outer embed, so messages go to
// window.top as well as the immediate parent — posting only to parent would stop at the
// intermediate frame and never reach the Anikoto page.
(() => {
  const log = (...args) => console.log('%c[akn:embed]', 'color:#7dd3fc;font-weight:bold', ...args);
  // Logged before the early return so a frame that deliberately does nothing still
  // says so, rather than looking like the script never ran.
  log('script loaded', {
    url: location.href,
    isTop: window.top === window,
    alreadyRunning: Boolean(window.__aknEmbed),
    readyState: document.readyState
  });
  // May arrive twice: once from the manifest, once injected for a host discovered at
  // runtime. Only the first instance should attach listeners.
  if (window.top === window || window.__aknEmbed) return;
  window.__aknEmbed = true;
  const TICK_MS = 250;
  let video = null;
  let announced = false;

  let posted = 0;
  function post(payload) {
    const message = JSON.stringify(payload);
    const targets = [...new Set([window.top, window.parent])].filter(target => target && target !== window);
    let sent = 0;
    for (const target of targets) {
      try { target.postMessage(message, '*'); sent++; }
      catch (error) { log('post failed', payload.akn, error.message); }
    }
    // Time updates are continuous; only the first few are worth reporting.
    if (payload.akn !== 'time' || posted++ < 3) log('posted', payload.akn, {targets: targets.length, sent});
  }

  // Some players mount the video inside a shadow root, where querySelector cannot see it.
  function findVideo(root = document) {
    const direct = root.querySelector('video');
    if (direct) return direct;
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot) {
        const nested = findVideo(element.shadowRoot);
        if (nested) return nested;
      }
    }
    return null;
  }

  function send() {
    if (!video) return;
    const position = Number(video.currentTime);
    if (Number.isFinite(position)) post({akn: 'time', position, paused: video.paused});
  }

  function attach(next) {
    if (!next || next === video) return;
    video = next;
    log('video element attached', {
      src: (video.currentSrc || video.src || '').slice(0, 120),
      readyState: video.readyState,
      textTracks: video.textTracks ? video.textTracks.length : 0
    });
    for (const event of ['timeupdate', 'seeked', 'play', 'pause']) video.addEventListener(event, send);
    post({akn: 'hello', url: location.href, hasVideo: true});
    send();
  }

  // The Albanian VTT arrives as text from the Anikoto frame. The blob URL is created
  // here, in the player's own origin, so the player can load it without a cross-origin
  // request that the embed's CSP might refuse.
  let trackUrl = null;
  let forced = false;
  window.addEventListener('message', event => {
    let data = event.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return; } }
    if (!data || typeof data !== 'object' || data.akn !== 'vtt' || typeof data.text !== 'string') return;
    if (trackUrl) URL.revokeObjectURL(trackUrl);
    trackUrl = URL.createObjectURL(new Blob([data.text], {type: 'text/vtt'}));
    forced = false;
    log('received VTT', {bytes: data.text.length, blob: trackUrl, childFrames: document.querySelectorAll('iframe').length});
    // Same frame, page world: inject.js is listening for this.
    window.postMessage({akn: 'track', file: trackUrl, label: data.label || 'Albanian'}, '*');
    // MegaPlay nests another same-origin frame, so relay to any child that holds it.
    for (const frame of document.querySelectorAll('iframe')) {
      try { frame.contentWindow?.postMessage(data, '*'); } catch {}
    }
  });

  // Marking the track `default` in the sources response is the primary mechanism, but
  // players differ in whether they honour it, so the native track is switched on as a
  // fallback. This runs once per loaded subtitle, so choosing another language
  // afterwards is not overridden.
  function enforceDefault() {
    if (forced || !trackUrl || !video) return;
    const tracks = video.textTracks;
    if (!tracks || !tracks.length) return;
    let ours = null;
    for (const candidate of tracks) if (/albanian|shqip/i.test(candidate.label || '')) ours = candidate;
    if (!ours) return;
    for (const candidate of tracks) {
      if (candidate === ours) candidate.mode = 'showing';
      else if (candidate.mode === 'showing') candidate.mode = 'disabled';
    }
    forced = true;
    post({akn: 'hello', url: location.href, hasVideo: true, defaulted: true});
  }

  function scan() {
    attach(findVideo());
    if (!announced) {
      announced = true;
      post({akn: 'hello', url: location.href, hasVideo: Boolean(video)});
    }
  }

  new MutationObserver(scan).observe(document.documentElement, {subtree: true, childList: true});
  scan();
  // timeupdate only fires about four times a second, and some players throttle it
  // further while buffering; a light interval keeps captions from lagging.
  setInterval(() => {
    if (video?.isConnected) send(); else scan();
    enforceDefault();
  }, TICK_MS);
})();
