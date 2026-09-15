# Animekinoteka — Albanian subtitles

Albanian (`sq`) subtitle tracks for anime, served as static files for the Animekinoteka
browser extension. The extension reads `index.json` from this repository root and fetches
the matching file when you open an episode.

## Format

`index.json`:

```json
{
  "version": 1,
  "language": "sq",
  "updated": "2026-09-15",
  "entries": [
    {
      "id": "liar-game-24",
      "title": "Liar Game",
      "episode": "24",
      "malId": 62331,
      "anilistId": 197754,
      "slugs": ["liar-game-kcq5v"],
      "file": "files/liar-game-24.sq.vtt",
      "offset": 0
    }
  ]
}
```

| Field | Notes |
| --- | --- |
| `id` | Unique, stable. Used as the key for the viewer's saved timing offset. |
| `episode` | String. Decimals allowed for specials, e.g. `"11.5"`. |
| `malId` | MyAnimeList series ID. **The most important field** — see below. |
| `anilistId` | AniList series ID. Optional. |
| `slugs` | Site slugs for the series. Optional, and the weakest match. |
| `file` | Path relative to this repository root. Must stay inside the repo. |
| `offset` | Starting timing offset in seconds. Positive shows subtitles later. |

Files are WebVTT. The offset is metadata rather than being baked into the cue times, so
the viewer's own timing controls stay the single source of truth.

## Matching

An entry is registered under every identifier it carries, and lookups are tried
`malId` → `anilistId` → `slug`, each scoped to the episode number.

**Always fill in `malId` when you can.** It is the only identifier the source site exposes
on every episode, and unlike a slug it survives a series being renamed or re-slugged.
An entry with only a slug will stop matching the moment that slug changes.

## Adding a subtitle

1. Add the file under `files/`.
2. Add an entry to `index.json` with a unique `id` and at least one identifier plus the
   episode number.
3. Check timing at the start, middle and end of the episode, and record a starting
   `offset` if the encode runs consistently early or late.

Timing is the usual problem: a track authored against one encode can drift against
another that handles the intro or recap differently. The extension's nudge controls
adjust it per episode and remember the result on that device.
