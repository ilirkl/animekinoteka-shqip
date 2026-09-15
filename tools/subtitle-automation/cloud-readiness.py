"""Read-only checks run on a GitHub-hosted machine. No translation API calls."""
import json
import re
import sys
import urllib.request
from pipeline import FEED, fetch, releases, attachment, decompress, segments

checks = []
try:
    items = releases(fetch(FEED))
    assert items, 'No single-episode 1080p entries in feed'
    checks.append(f'Feed reachable: {len(items)} qualifying 1080p releases')
    last_error = None
    for release in items[:5]:
        try:
            meta = json.loads(fetch(f'https://feed.animetosho.xyz/json?id={release["id"]}&show=torrent'))
            raw = decompress(fetch(attachment(meta, release)))
            _, slots = segments(raw)
            checks.append(f'English ASS attachment fetched and validated: {len(slots)} visible segments')
            break
        except Exception as exc:
            last_error = exc
    else:
        raise RuntimeError(f'No usable attachment among latest five releases: {last_error}')
    print('\n'.join(checks))
except Exception as exc:
    print('\n'.join(checks),file=sys.stderr)
    print(f'Cloud readiness check failed: {type(exc).__name__}: {exc}',file=sys.stderr)
    sys.exit(1)
