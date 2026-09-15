# ChatGPT cloud subtitle support

These are the previously local helper modules needed by the Albanian subtitle workflow. Use this folder as a temporary Node project in the cloud. Run `npm ci --ignore-scripts --no-audit --no-fund` to install the locked HTML parser dependencies. The scripts are ES modules. Python's `lzma` and the standard-library parser/validator in `../pipeline.py` handle the subtitle attachments.

Import `search` and `getAnime` from `scripts/anikoto.mjs`, title-matching functions from `scripts/lib/match-title.mjs`, and `parseSubtitles` / `toVtt` from `extension/lib/subtitles.js`. Use the reviewed, bounded series mapping in `../numbering.mjs`; reject unknown numbering offsets and ambiguous series. The earlier LOCAL publisher `../project.mjs` expects a Windows project layout and local Git authentication: do not assume it runs unchanged in a web task.

## Cloud migration acceptance checks

Before enabling a cloud schedule, verify that the actual ChatGPT web task can:

1. Download the SubsPlease RSS feed, JSON release details, and a verified 1080p English ASS attachment using the bounded fetching code in `../pipeline.py`. The existing `../cloud-readiness.py` and `../cloud-match-check.mjs` probes succeeded on GitHub-hosted Linux, but that does not prove connectivity from ChatGPT's environment.
2. Decompress XZ and run `segments` / `assemble`. Rebuild a known Albanian subtitle byte-for-byte as a validation test, retaining source metadata and ASS controls. Translate new segments with ChatGPT itself, not a separately billed API. Keep a per-series glossary and review all dialogue for fluency, meaning, consistent names and completeness.
3. Access the GitHub repository through its connected app, with working multi-file commit and branch-update capabilities or a supported authenticated checkout. A local desktop GitHub login is not a cloud credential. Do not request tokens in chat or send translation API requests.
4. Fetch the latest `index.json` and use its stable series IDs and episode numbers to avoid duplicates. Preserve original release numbering separately from provider numbering. Reconcile the current feed against the published catalog so an initialization cutoff does not silently omit current unseen releases.
5. Keep pending release metadata and translation progress in an approved cloud-accessible store. Web task scratch folders are not durable between runs. Do not publish English source dialogue, local state, credentials or tokens in the public repository. Published release IDs and catalog entries may serve as the completed-work ledger.
6. Publish completed ASS, VTT and the updated index in one scoped commit based on the latest main branch. Verify the new remote commit and catalog entry. Refuse unexpected file edits, existing episode replacement and forced branch updates. If main advances, reload and merge catalog entries without overwriting others. Commit messages must not include AI attribution.
7. Demonstrate these steps in the cloud before scheduling. If there is no new episode, perform a no-op replay of an already published episode and verify write permissions separately; do not manufacture duplicate subtitles to test publication. If a publishing test is required, clearly identify its narrow, harmless change.

Then use the ChatGPT web task's own scheduling tool to run this same workflow every three hours, keeping quiet when nothing is new and reporting new publications, meaningful failures or necessary matching decisions. Report the actual cloud schedule and its verified capabilities. Do not claim that a task is scheduled simply because this prompt was saved.

The existing desktop automation is `albanian-subtitles-hourly`. Keep it running until the cloud replacement passes the checks, then have the original desktop task pause it to avoid two publishers. No cloud schedule or migration completion is implied by this support bundle alone.

Repository: https://github.com/ilirkl/animekinoteka-shqip

Feed: https://feed.animetosho.xyz/rss2?group=SubsPlease

Existing published source releases include 688656 (Red River 11) and 688626 (Samurai Troopers 23, mapped to Part 2 episode 11). Always reload the repository index rather than relying on this historical list.
