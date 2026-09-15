export function timestamp(value) {
  const parts = value.trim().replace(',', '.').split(':').map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some(x => !Number.isFinite(x) || x < 0)) return NaN;
  return parts.reduce((total, n) => total * 60 + n, 0);
}
const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function fields(line, count) {
  const result = [];
  for (let i = 0; i < count - 1; i++) {
    const end = line.indexOf(',');
    if (end < 0) return [];
    result.push(line.slice(0, end).trim()); line = line.slice(end + 1);
  }
  return [...result, line];
}
function assText(raw) {
  let drawing = false, out = '';
  for (const part of raw.split(/(\{[^}]*\})/g)) {
    if (part.startsWith('{')) {
      const mode = part.match(/\\p(\d+)/);
      if (mode) drawing = Number(mode[1]) > 0;
    } else if (!drawing) out += part;
  }
  return escape(out.replace(/\\[Nn]/g, '\n').replace(/\\h/g, '\u00a0')).trim();
}
export function parseSubtitles(source, filename = '') {
  const text = source.replace(/^\uFEFF/, '').replace(/\r/g, '');
  const cues = [];
  if (/\.(ass|ssa)$/i.test(filename) || text.includes('[Events]')) {
    let section = '', format = [], styleFormat = [];
    const styles = new Map();
    for (const line of text.split('\n')) {
      if (/^\[/.test(line)) { section = line.trim(); continue; }
      if (/^Format:/i.test(line)) {
        const f = line.slice(7).split(',').map(x => x.trim().toLowerCase());
        if (section === '[Events]') format = f; else styleFormat = f;
      }
      if (/^Style:/i.test(line)) {
        const values = fields(line.slice(6).trim(), styleFormat.length);
        styles.set(values[styleFormat.indexOf('name')], Number(values[styleFormat.indexOf('alignment')]));
      }
      if (section !== '[Events]' || !/^Dialogue:/i.test(line) || !format.length) continue;
      const values = fields(line.slice(9).trim(), format.length);
      const raw = values[format.indexOf('text')] || '';
      const alignment = Number(raw.match(/\\an([1-9])/)?.[1]) || styles.get(values[format.indexOf('style')]) || 2;
      cues.push({start:timestamp(values[format.indexOf('start')] || ''), end:timestamp(values[format.indexOf('end')] || ''), text:assText(raw), top:alignment >= 7});
    }
  } else {
    for (const block of text.split(/\n\s*\n/)) {
      const lines = block.split('\n');
      const at = lines.findIndex(line => line.includes('-->'));
      if (at < 0 || /^(NOTE|STYLE|REGION)\b/.test(lines[0])) continue;
      const [start, end] = lines[at].split('-->').map(x => x.trim().split(/\s/)[0]);
      cues.push({start:timestamp(start), end:timestamp(end), text:escape(lines.slice(at + 1).join('\n').replace(/<[^>]*>/g, '')).replace(/&amp;(amp|lt|gt);/g,'&$1;').trim(), top:/line:(0|10)%/.test(lines[at])});
    }
  }
  return cues.filter(c => Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start && c.text).sort((a,b) => a.start - b.start);
}
export function shiftCues(cues, offset) {
  if (!Number.isFinite(offset)) throw new Error('Invalid subtitle offset');
  return cues.map(c => ({...c,start:Math.max(0,c.start + offset),end:c.end + offset})).filter(c => c.end > c.start);
}
function formatTime(seconds) {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2,'0')}:${String(Math.floor(ms / 60000) % 60).padStart(2,'0')}:${String(Math.floor(ms / 1000) % 60).padStart(2,'0')}.${String(ms % 1000).padStart(3,'0')}`;
}
export function toVtt(cues, offset = 0) {
  return 'WEBVTT\n\n' + shiftCues(cues, offset).map((c,i) => `${i + 1}\n${formatTime(c.start)} --> ${formatTime(c.end)}${c.top ? ' line:10%' : ''}\n${c.text}\n`).join('\n');
}
export function validateMediaUrl(value) {
  if (value.startsWith('blob:')) throw new Error('That blob address belongs to another browser session. Use the original HTTPS media URL.');
  let url;
  try { url = new URL(value); } catch { throw new Error('Enter a full HTTPS media URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use an HTTPS media URL without embedded credentials.');
  if (/\/watch\//i.test(url.pathname)) throw new Error('This is a watch page. A direct media URL is needed.');
  return url.href;
}
