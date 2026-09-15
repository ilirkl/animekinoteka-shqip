// Runs in the Anikoto top frame. The player itself is a cross-origin iframe, so cues are
// drawn in an overlay stacked on top of it and driven by the playback-time messages the
// embed already posts to its parent.
(() => {
  const POLL_MS = 500;
  let entry = null;          // {id, title, offset, cues} from the service worker
  let offset = 0;
  let lastKey = null;        // slug + episode currently loaded
  let lastRendered = '';
  let lastTimeAt = 0;
  let embed = null;          // last {akn:'hello'} report from the player frame
  let lastFrameSrc = '';
  let resend = 0;            // remaining attempts to hand the VTT to the player frame
  let grant = null;          // last reply from the worker's runtime injection attempt
  let lastDomReport = 0;
  let lastHeartbeat = 0;
  let everHadFrame = false;  // distinguishes "playback not started" from a real failure
  let frameSince = 0;        // when the current player frame appeared

  // The iframe's src attribute is readable from here even though its document is not,
  // which is how the player's host is discovered without hardcoding it.
  function frameOrigin() {
    const frame = frameEl();
    if (!frame?.src) return null;
    try { return new URL(frame.src, location.href).origin; } catch { return null; }
  }
  let overlay, caption, panel, status, poller;
  const T0 = Date.now();
  const stamp = () => `+${((Date.now() - T0) / 1000).toFixed(1)}s`;
  // Objects are stringified because the chrome://extensions error viewer flattens them
  // to [object Object], which makes the diagnostics useless exactly where they are read.
  const dump = value => { try { return typeof value === 'object' && value ? JSON.stringify(value, null, 2) : String(value); } catch { return String(value); } };
  const line = args => args.map(arg => typeof arg === 'object' && arg ? dump(arg) : arg);
  const log = (...args) => console.log('%c[akn:top]', 'color:#9ae600;font-weight:bold', stamp(), ...line(args));
  const warn = (...args) => console.warn('[akn:top]', stamp(), ...line(args));

  // Reports everything that could explain a missing player frame, since the frame is
  // the step that keeps failing and the cause is not visible from a single selector.
  function describeDom() {
    const player = document.querySelector('#player');
    const wrapper = document.querySelector('#player-wrapper');
    const describe = el => el
      ? el.tagName + (el.id ? `#${el.id}` : '') + (el.className ? `.${String(el.className).trim().split(/\s+/).join('.')}` : '')
      : null;
    return {
      url: location.href,
      hasPlayer: Boolean(player),
      hasWrapper: Boolean(wrapper),
      playerChildren: player ? [...player.children].map(describe) : null,
      playerHtml: player ? player.innerHTML.slice(0, 500) : null,
      iframeCount: document.querySelectorAll('iframe').length,
      iframes: [...document.querySelectorAll('iframe')].map((frame, index) => ({
        index,
        id: frame.id || null,
        cls: frame.className || null,
        srcAttr: frame.getAttribute('src'),
        srcProp: frame.src || null,
        parent: describe(frame.parentElement)
      })),
      episodesLoaded: Boolean(document.querySelector('#w-episodes a[data-num]')),
      activeEpisode: describe(document.querySelector('#w-episodes a.active[data-num]')),
      serversLoaded: Boolean(document.querySelector('#w-servers li[data-link-id]')),
      activeServer: (document.querySelector('#w-servers li.active')?.textContent || '').trim() || null
    };
  }
  // Bumped whenever this file changes, so a stale build is obvious at a glance rather
  // than being mistaken for a bug that was already fixed.
  const BUILD = '2026-09-15-h';
  log('content script loaded', {build: BUILD, readyState: document.readyState});

  // A single self-contained report. The chrome://extensions page only records warnings
  // and errors and flattens objects, so the diagnostics are put on the clipboard from
  // the page itself rather than relying on a console being read.
  function diagnostics() {
    return dump({
      build: BUILD,
      at: new Date().toISOString(),
      url: location.href,
      entry: entry ? {id: entry.id, cues: entry.cues.length, vttBytes: entry.vtt ? entry.vtt.length : 0} : null,
      offset,
      everHadFrame,
      lastFrameSrc,
      embedReported: embed,
      injection: grant,
      messagesSeen: messageCount,
      messageShapes: [...seenShapes],
      secondsSinceTime: lastTimeAt ? Number(((Date.now() - lastTimeAt) / 1000).toFixed(1)) : null,
      dom: describeDom()
    });
  }

  const playerEl = () => document.querySelector('#player');
  // Anikoto's own fullscreen script looks the player up under either wrapper, so match
  // the same set rather than assuming one.
  const frameEl = () => document.querySelector('#player iframe, #player-wrapper iframe, #video-player');

  function context() {
    const slug = location.pathname.match(/^\/watch\/([^/?#]+)/)?.[1] || null;
    const active = document.querySelector('#w-episodes a.active[data-num]');
    if (!slug || !active) return null;
    const style = playerEl()?.getAttribute('style') || '';
    return {
      slug,
      episode: active.getAttribute('data-num'),
      malId: Number(active.getAttribute('data-mal')) || null,
      anilistId: Number(style.match(/banner\/(\d+)/)?.[1]) || null
    };
  }

  function mount() {
    const player = playerEl();
    if (!player || overlay?.isConnected) return Boolean(overlay?.isConnected);
    if (getComputedStyle(player).position === 'static') player.style.position = 'relative';
    overlay = document.createElement('div');
    overlay.className = 'akn-overlay';
    caption = document.createElement('div');
    caption.className = 'akn-caption';
    panel = document.createElement('div');
    panel.className = 'akn-panel';
    status = document.createElement('span');
    status.className = 'akn-status';
    const nudge = (label, delta, title) => {
      const button = document.createElement('button');
      button.textContent = label; button.title = title; button.type = 'button';
      button.addEventListener('click', event => { event.preventDefault(); setOffset(offset + delta); });
      return button;
    };
    const full = document.createElement('button');
    full.type = 'button'; full.textContent = '⛶'; full.title = 'Fullscreen with subtitles';
    full.addEventListener('click', event => {
      event.preventDefault();
      if (document.fullscreenElement) document.exitFullscreen();
      else player.requestFullscreen?.();
    });
    const copy = document.createElement('button');
    copy.type = 'button'; copy.textContent = '⧉'; copy.title = 'Copy diagnostics to clipboard';
    copy.addEventListener('click', async event => {
      event.preventDefault();
      const report = diagnostics();
      const done = ok => { status.textContent = ok ? 'Diagnostics copied' : 'Diagnostics printed to console'; };
      try { await navigator.clipboard.writeText(report); done(true); return; } catch {}
      // Clipboard API can be refused without focus, so fall back to a selection copy.
      const area = document.createElement('textarea');
      area.value = report;
      area.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0';
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch {}
      area.remove();
      if (!ok) console.log(report);
      done(ok);
    });
    panel.append(status, nudge('−0.5', -0.5, 'Subtitles 0.5s earlier'), nudge('+0.5', 0.5, 'Subtitles 0.5s later'), copy, full);
    overlay.append(caption, panel);
    player.appendChild(overlay);
    return true;
  }

  async function setOffset(value) {
    offset = Math.max(-600, Math.min(600, Math.round(value * 10) / 10));
    showStatus();
    lastRendered = '';
    if (entry) await chrome.storage.local.set({[`offset:${entry.id}`]: offset});
  }

  function showStatus() {
    if (!status) return;
    status.textContent = entry
      ? `${entry.cues.length} cues · ${offset >= 0 ? '+' : ''}${offset.toFixed(1)}s`
      : 'No Albanian subtitles';
  }

  // parseSubtitles escapes &, < and > at parse time, so cue text is safe as markup here.
  function paint(cues) {
    const html = cues.map(cue => `<span>${cue.text.replace(/\n/g, '<br>')}</span>`).join('');
    if (html === lastRendered) return;
    lastRendered = html;
    caption.innerHTML = html;
    caption.classList.toggle('akn-top', cues.length > 0 && cues.every(cue => cue.top));
  }

  function cuesAt(time) {
    if (!entry) return [];
    const cues = entry.cues, at = time - offset, out = [];
    let low = 0, high = cues.length;
    while (low < high) { const mid = (low + high) >> 1; if (cues[mid].start <= at) low = mid + 1; else high = mid; }
    for (let i = low - 1; i >= 0 && i >= low - 40; i--) {
      if (cues[i].start <= at && at < cues[i].end) out.unshift(cues[i]);
    }
    return out;
  }

  function onTime(position) {
    if (!Number.isFinite(position)) return;
    lastTimeAt = Date.now();
    if (!overlay?.isConnected) return;
    paint(cuesAt(position));
  }

  // The player reports its position in several shapes, all observed in Anikoto's own
  // scripts: main.js watchlog and watch-mana.min.js read {channel:'megacloud',
  // event:'time', time}, watch-mana also accepts {type:'watching-log', currentTime},
  // WatchManager handles {event:'PLAY_TIMING', data:{position}}, and handle-bridge.min.js
  // emits {event:'time', position}. Megacloud names the field `time`, not `position`.
  function positionFrom(data) {
    if (data.akn === 'time') return Number(data.position);
    if (data.channel === 'megacloud' && data.event === 'time') return Number(data.time);
    if (data.type === 'watching-log') return Number(data.currentTime);
    if (data.event === 'PLAY_TIMING') return Number(data.data?.position);
    if (data.event === 'time') return Number(data.position ?? data.time);
    return NaN;
  }

  let messageCount = 0;
  const seenShapes = new Set();
  window.addEventListener('message', event => {
    let data = event.data;
    messageCount++;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return; } }
    if (!data || typeof data !== 'object') return;
    // Log one line per distinct message shape rather than per message, so the flood of
    // time updates does not bury the handshake messages that matter.
    const shape = `${data.akn || ''}|${data.channel || ''}|${data.type || ''}|${data.event || ''}|${Object.keys(data).sort().join(',')}`;
    if (!seenShapes.has(shape)) {
      seenShapes.add(shape);
      log('new message shape from', event.origin, JSON.stringify(data).slice(0, 260));
    }
    // Our own embed script is identified by its marker and may sit in a nested frame,
    // so it is not matched against #player iframe.
    if (data.akn === 'hello') { embed = data; log('player frame reported', data); return; }
    const position = positionFrom(data);
    if (!Number.isFinite(position)) return;
    if (!lastTimeAt) log('first time signal', {shape: data.channel || data.type || data.event, position});
    onTime(position);
  });

  function startPolling() {
    clearInterval(poller);
    poller = setInterval(() => {
      if (!entry) return;
      const frame = frameEl();
      const now = Date.now();

      if (!frame) {
        if (now - lastDomReport > 3000) {
          lastDomReport = now;
          // Anikoto renders only a poster and a play button until a server is loaded;
          // the iframe is created at that point. Before then this is expected state,
          // not a fault, so it is only a warning if a frame existed and went away.
          if (everHadFrame) warn('player frame disappeared', describeDom());
          else log('no iframe yet — waiting for playback to start', describeDom());
        }
      } else {
        everHadFrame = true;
        try { frame.contentWindow.postMessage(JSON.stringify({cmd: 'GET_TIME'}), '*'); }
        catch (error) { warn('GET_TIME post failed', error.message); }
        // The player frame reloads on episode and server changes, and a message sent
        // before its scripts are listening is simply lost, so retry a bounded number
        // of times rather than assuming the first one landed.
        if (frame.src !== lastFrameSrc) {
          lastFrameSrc = frame.src;
          resend = 8;
          frameSince = now;
          grant = null;
          log('player frame appeared', {src: frame.src, srcAttr: frame.getAttribute('src'), origin: frameOrigin()});
        }
        // The manifest already covers the usual player host, so its content script
        // reports in by itself and no permission is involved. Runtime injection — and
        // the prompt it needs — is only requested once that has clearly not happened,
        // which means the host has changed to one the manifest does not match.
        if (!embed && !grant && frameSince && now - frameSince > 2500) {
          const origin = frameOrigin();
          if (!origin) warn('frame found but has no usable origin', describeDom());
          else {
            grant = {pending: true};
            log('player host not covered by the manifest, requesting injection', origin);
            chrome.runtime.sendMessage({type: 'embed', origin})
              .then(reply => { grant = reply; log('runtime injection reply', reply); })
              .catch(error => { grant = null; warn('runtime injection failed', error.message); });
          }
        }
        if (resend > 0 && entry.vtt) {
          resend--;
          log('posting VTT to player frame', {attemptsLeft: resend, bytes: entry.vtt.length});
          try { frame.contentWindow.postMessage({akn: 'vtt', text: entry.vtt, label: 'Shqip'}, '*'); }
          catch (error) { warn('VTT post failed', error.message); }
        }
      }

      if (now - lastHeartbeat > 3000) {
        lastHeartbeat = now;
        log('state', {
          entry: entry.id,
          cues: entry.cues.length,
          hasFrame: Boolean(frame),
          frameSrc: frame ? frame.src : null,
          embedReported: embed,
          injection: grant,
          messagesSeen: messageCount,
          sinceTime: lastTimeAt ? `${((now - lastTimeAt) / 1000).toFixed(1)}s` : 'never'
        });
      }
      if (!status) return;
      const stale = Date.now() - lastTimeAt > 4000;
      const waiting = !everHadFrame && !embed;
      status.classList.toggle('akn-warn', stale && !waiting);
      if (stale) {
        let host = 'unknown';
        try { const origin = frameOrigin(); if (origin) host = new URL(origin).host; } catch {}
        status.textContent = embed
          ? (embed.hasVideo ? 'Player found, but reports no time' : 'Player frame has no video element')
          : grant?.code === 'NEEDS_PERMISSION' ? `Allow ${host} in the extension options`
          : waiting ? `${entry.cues.length} cues ready · press play`
          : `Player frame not reachable (${host})`;
        paint([]);
      } else showStatus();
    }, POLL_MS);
  }

  let loggedNoContext = false;
  async function sync() {
    const next = context();
    if (!next) {
      if (!loggedNoContext) {
        loggedNoContext = true;
        warn('no episode context yet', describeDom());
      }
      return;
    }
    loggedNoContext = false;
    const key = `${next.slug}:${next.episode}`;
    if (key === lastKey) return;
    lastKey = key;
    entry = null; lastRendered = ''; lastTimeAt = 0; embed = null; offset = 0;
    frameSince = 0; grant = null;
    log('episode detected', next);
    if (!mount()) { log('no #player element to attach the overlay to'); return; }
    caption.innerHTML = '';
    showStatus();
    let response;
    try { response = await chrome.runtime.sendMessage({type: 'lookup', ...next}); }
    catch (error) {
      log('background worker did not respond', error);
      status.textContent = 'Extension background worker is not running';
      return;
    }
    if (lastKey !== key) return;
    log('lookup result', response?.ok ? `${response.cues.length} cues` : response);
    if (!response?.ok) {
      const messages = {
        NO_MATCH: 'No Albanian subtitles for this episode',
        NOT_CONFIGURED: 'Set the subtitle repository in the extension options'
      };
      status.textContent = messages[response?.code] || response?.message || 'Subtitles unavailable';
      return;
    }
    entry = response;
    resend = 8;
    const saved = await chrome.storage.local.get(`offset:${entry.id}`);
    offset = Number(saved[`offset:${entry.id}`] ?? entry.offset) || 0;
    showStatus();
    startPolling();
  }

  // Marking Anikoto's own listings and episode lists ---------------------------------
  // Cards can only be matched on slug, because the listing markup carries no MAL ID.
  // Episode links do carry data-mal, so they use the stronger key.
  let markKeys = null;
  let markSlugs = null;

  async function loadMarks() {
    let reply;
    try { reply = await chrome.runtime.sendMessage({type: 'marks'}); }
    catch (error) { warn('marks request failed', error.message); return; }
    if (!reply?.ok) { log('marks unavailable', reply); return; }
    markKeys = new Set(reply.keys);
    markSlugs = new Set(reply.keys
      .filter(key => key.startsWith('slug:'))
      .map(key => key.slice(5, key.lastIndexOf(':'))));
    log('marks loaded', {keys: markKeys.size, series: markSlugs.size});
    applyMarks();
  }

  function tick(title) {
    const badge = document.createElement('span');
    badge.className = 'akn-tick';
    badge.textContent = 'SHQIP';
    badge.title = title;
    return badge;
  }

  function applyMarks() {
    if (!markSlugs) return;
    let cards = 0, episodes = 0;
    for (const anchor of document.querySelectorAll('a[href*="/watch/"]')) {
      const slug = anchor.getAttribute('href')?.match(/\/watch\/([a-z0-9-]+)/)?.[1];
      if (!slug || !markSlugs.has(slug)) continue;
      const host = anchor.querySelector('.poster') || anchor.closest('.item')?.querySelector('.poster');
      if (!host || host.dataset.aknMarked) continue;
      host.dataset.aknMarked = '1';
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      host.appendChild(tick('Albanian subtitles available'));
      cards++;
    }
    const slug = location.pathname.match(/^\/watch\/([^/?#]+)/)?.[1];
    for (const anchor of document.querySelectorAll('#w-episodes a[data-num]')) {
      if (anchor.dataset.aknMarked) continue;
      const number = Number(anchor.getAttribute('data-num'));
      const mal = anchor.getAttribute('data-mal');
      const hit = (mal && markKeys.has(`mal:${mal}:${number}`)) || (slug && markKeys.has(`slug:${slug}:${number}`));
      if (!hit) continue;
      anchor.dataset.aknMarked = '1';
      anchor.appendChild(tick('Albanian subtitles for this episode'));
      episodes++;
    }
    if (cards || episodes) log('marked', {cards, episodes});
  }

  const schedule = (() => { let timer; return () => { clearTimeout(timer); timer = setTimeout(() => { sync(); applyMarks(); }, 250); }; })();
  loadMarks();
  new MutationObserver(schedule).observe(document.documentElement, {
    subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'src']
  });
  window.addEventListener('hashchange', schedule);
  schedule();
})();
