import {DEFAULTS, baseUrlFrom} from './lib/config.js';

const FIELDS = Object.keys(DEFAULTS);
const $ = id => document.getElementById(id);
const ANY_HOST = {origins: ['https://*/*']};

function setState(text, kind) {
  $('state-text').textContent = text;
  $('dot').className = kind || '';
}

// Checked automatically on open, so the page reports whether it works rather than
// asking to be configured.
async function check() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  const base = baseUrlFrom(stored);
  if (!base) { setState('Nuk është caktuar depoja e titrave', 'bad'); return; }
  try {
    const response = await fetch(`${base}index.json`, {cache: 'no-cache'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const count = Array.isArray(data?.entries) ? data.entries.length : 0;
    if (!count) throw new Error('lista është bosh');
    setState(`Gati — ${count} episode me titra shqip`, 'ok');
  } catch (error) {
    setState(`Titrat nuk u arritën: ${error.message}`, 'bad');
  }
}

chrome.storage.local.get(DEFAULTS).then(stored => {
  for (const field of FIELDS) $(field).value = stored[field] || '';
});
check();

chrome.permissions.contains(ANY_HOST).then(has => {
  if (has) {
    $('grant-result').textContent = 'Leja është dhënë tashmë.';
    $('grant-result').style.color = '#9ae600';
    $('grant').disabled = true;
  }
});

// chrome.permissions.request() only works while the click's user gesture is still live,
// so it must be reached before the handler awaits anything.
$('grant').addEventListener('click', () => {
  chrome.permissions.request(ANY_HOST).then(
    granted => {
      $('grant-result').textContent = granted
        ? 'U dha. Rihap faqen e Anikoto-s.'
        : 'U refuzua — titrat s’arrijnë dot te lojtari.';
      $('grant-result').style.color = granted ? '#9ae600' : '#ff8f8f';
    },
    error => {
      $('grant-result').textContent = `Kërkesa dështoi: ${error.message}`;
      $('grant-result').style.color = '#ff8f8f';
    }
  );
});

$('save').addEventListener('click', () => {
  const values = Object.fromEntries(FIELDS.map(field => [field, $(field).value.trim()]));
  const base = baseUrlFrom(values);
  const say = (text, ok) => { $('result').textContent = text; $('result').style.color = ok ? '#9ae600' : '#ff8f8f'; };
  if (!base) { say('Plotëso përdoruesin dhe depon, ose një URL të plotë.', false); return; }

  let origin;
  try { origin = `${new URL(base).origin}/*`; }
  catch { say('Ajo URL nuk është e vlefshme.', false); return; }

  chrome.permissions.request({origins: [origin]}).then(async granted => {
    if (!granted) { say(`Leja për ${origin} u refuzua.`, false); return; }
    await chrome.storage.local.set(values);
    try { await chrome.runtime.sendMessage({type: 'refresh'}); } catch {}
    say('U ruajt.', true);
    check();
  }, error => say(`Kërkesa e lejes dështoi: ${error.message}`, false));
});
