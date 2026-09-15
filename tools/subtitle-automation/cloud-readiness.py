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
    origin = 'https://anikototv.to'
    def page(path):
        request = urllib.request.Request(origin + path, headers={'Referer': origin + '/', 'X-Requested-With':'XMLHttpRequest'})
        with urllib.request.urlopen(request,timeout=30) as response:
            raw = response.read(4 * 1024 * 1024 + 1)
        assert len(raw) <= 4 * 1024 * 1024, 'Response too large'
        return raw.decode('utf-8')
    catalog = page('/filter?page=1&sort=latest-updated&keyword=Liar+Game')
    assert 'data-jp=' in catalog, 'Romaji matching metadata missing'
    slugs = re.findall(r'href=[\"\']/watch/([a-z0-9-]+)',catalog)
    assert slugs, 'No series links found'
    html = page('/watch/' + slugs[0])
    tag = re.search(r'<[^>]+id=[\"\']watch-main[\"\'][^>]*>',html)
    assert tag, 'Series player metadata missing'
    series = re.search(r'data-id=[\"\'](\d+)',tag[0])
    assert series, 'Series identifier missing'
    episode_data = json.loads(page('/ajax/episode/list/' + series[1] + '?style=1&vrf='))
    assert episode_data.get('status') == 200 and 'data-num' in episode_data.get('result',''), 'Episode metadata unavailable'
    checks.append('Anikoto search, romaji titles, series and episode metadata reachable')
    print('\n'.join(checks))
except Exception as exc:
    print('\n'.join(checks),file=sys.stderr)
    print(f'Cloud readiness check failed: {type(exc).__name__}: {exc}',file=sys.stderr)
    sys.exit(1)
