import {DEFAULTS, baseUrlFrom} from './lib/config.js';

const FIELDS = Object.keys(DEFAULTS);
const $ = id => document.getElementById(id);
const say = (text, ok) => { $('result').textContent = text; $('result').style.color = ok ? '#d7f583' : '#ff8f8f'; };

const ANY_HOST = {origins: ['https://*/*']};
const grantSay = (text, ok) => { $('grant-result').textContent = text; $('grant-result').style.color = ok ? '#d7f583' : '#ff8f8f'; };

chrome.permissions.contains(ANY_HOST).then(has => {
  if (has) grantSay('Granted — the player host is reachable.', true);
});

// Must be reached before the handler awaits anything, or the user gesture is gone.
$('grant').addEventListener('click', () => {
  chrome.permissions.request(ANY_HOST).then(
    granted => grantSay(granted ? 'Granted. Reload the Anikoto tab.' : 'Declined — subtitles cannot reach the player.', granted),
    error => grantSay(`Request failed: ${error.message}`, false)
  );
});

chrome.storage.local.get(DEFAULTS).then(saved => {
  for (const field of FIELDS) $(field).value = saved[field] || '';
  if (!$('branch').value) $('branch').value = 'main';
});

// chrome.permissions.request() only works while the click's user gesture is still live,
// so it must be reached before the handler awaits anything. An already-granted origin
// resolves true without prompting, so there is no need to check contains() first.
$('save').addEventListener('click', () => {
  const values = Object.fromEntries(FIELDS.map(field => [field, $(field).value.trim()]));
  const base = baseUrlFrom(values);
  if (!base) { say('Enter a user and repository, or a full base URL.', false); return; }

  let origin;
  try { origin = `${new URL(base).origin}/*`; }
  catch { say('That base URL is not valid.', false); return; }

  say('Saving…', true);
  chrome.permissions.request({origins: [origin]}).then(
    granted => granted ? save(values, base) : say(`Permission for ${origin} was declined.`, false),
    error => say(`Could not request permission for ${origin}: ${error.message}`, false)
  );
});

async function save(values, base) {
  try {
    await chrome.storage.local.set(values);
  } catch (error) { say(`Could not save settings: ${error.message}`, false); return; }

  // A background worker that failed to load rejects here. Report it instead of dying
  // silently — the settings are already stored, so the check below is still worth running.
  let workerWarning = '';
  try {
    await chrome.runtime.sendMessage({type: 'refresh'});
  } catch (error) {
    workerWarning = ` Background worker did not respond (${error.message}) — check chrome://extensions for an "Errors" badge and reload the extension.`;
  }

  say(`Saved.${workerWarning} Checking index.json…`, !workerWarning);
  try {
    const response = await fetch(`${base}index.json`, {cache: 'no-cache'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const count = Array.isArray(data?.entries) ? data.entries.length : 0;
    if (!count) throw new Error('no entries found');
    say(`Saved. Found ${count} subtitle ${count === 1 ? 'entry' : 'entries'}.${workerWarning}`, !workerWarning);
  } catch (error) {
    say(`Saved, but ${base}index.json could not be read: ${error.message}${workerWarning}`, false);
  }
}
