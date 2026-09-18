// Generates the contents of the public subtitle repository the extension reads.
// Output: subtitle-repo/index.json + subtitle-repo/files/*.sq.vtt — commit and push
// that directory, then point the extension's options at it.
import {mkdir, readFile, writeFile, rm, copyFile} from 'node:fs/promises';
import {parseSubtitles, toVtt} from '../extension/lib/subtitles.js';

const OUT = 'subtitle-repo';
const catalog = JSON.parse(await readFile('catalog.json', 'utf8'));

// Only the generated files are cleared. Removing OUT itself would delete the .git
// directory of the published repository along with it.
await rm(`${OUT}/files`, {recursive: true, force: true});
await mkdir(`${OUT}/files`, {recursive: true});
await mkdir(`${OUT}/ass`, {recursive: true});

const entries = [];
for (const episode of catalog) {
  const source = `.${episode.subtitle}`;
  const cues = parseSubtitles(await readFile(source, 'utf8'), source);
  if (!cues.length) throw new Error(`No cues parsed from ${source}`);
  const file = `files/${episode.id}.sq.vtt`;
  // Offset stays metadata rather than being baked in, so the extension's nudge
  // controls remain the single source of truth for timing.
  await writeFile(`${OUT}/${file}`, toVtt(cues, 0));
  const assFile = `ass/${episode.id}.sq.ass`;
  await copyFile(source, `${OUT}/${assFile}`);
  const entry = {
    id: episode.id,
    title: episode.title,
    episode: String(episode.episode),
    malId: episode.malId ?? null,
    anilistId: episode.anilistId ?? null,
    slugs: episode.slug ? [episode.slug] : [],
    file,
    assFile,
    offset: episode.offset || 0
  };
  // The automation publishes these alongside the fields above. A rebuild has to carry
  // them through, or it silently strips provenance from every automated entry.
  // `at-<release>` ids encode the AnimeTosho release they came from; hand-added
  // episodes predate that scheme and correctly have none.
  if (episode.id.startsWith('at-')) entry.sourceReleaseId = episode.id.slice(3);
  for (const key of ['sourceEpisode', 'sourceTitle', 'part', 'numberingEvidence']) {
    if (episode[key] !== undefined) entry[key] = episode[key];
  }
  entries.push(entry);
  console.log(`${episode.id}: ${cues.length} cues -> ${file}`);
}

const index = {version: 1, language: 'sq', updated: new Date().toISOString().slice(0, 10), entries};
await writeFile(`${OUT}/index.json`, `${JSON.stringify(index, null, 2)}\n`);
console.log(`\n${OUT}/index.json written with ${entries.length} entries.`);
const weak = entries.filter(entry => !entry.malId).map(entry => entry.id);
if (weak.length) console.log(`No malId (weakest match key) for: ${weak.join(', ')} — add it to catalog.json.`);
