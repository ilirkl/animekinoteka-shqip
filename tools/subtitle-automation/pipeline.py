"""Local hourly subtitle queue. Python 3.12+, standard library only."""
import argparse
import contextlib
import datetime as dt
import email.utils
import hashlib
import json
import lzma
from pathlib import Path
import re
import subprocess
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

# SubsPlease leads: it is the established source, and scanning it first means an
# episode both groups carry is queued under its numbering rather than Erai's.
# The two overlap heavily - Erai is a second shot at the same service rip when
# SubsPlease is late or skips one, not a wider catalogue.
FEEDS = ('https://feed.animetosho.xyz/rss2?group=SubsPlease',
         'https://feed.animetosho.xyz/rss2?group=Erai-raws')
LIMIT = 8 * 1024 * 1024
RELEASE = re.compile(r'^\[SubsPlease\] (.+) - (\d+(?:\.\d+)?) \(1080p\) \[([A-Fa-f0-9]{8})\](?:\.mkv)?$')
# Inside a batch the episodes keep any revision suffix they shipped with ("- 01v2"),
# which the feed-level pattern deliberately does not accept for standalone releases.
BATCH_FILE = re.compile(r'^\[SubsPlease\] (.+) - (\d+(?:\.\d+)?)(?:v\d+)? \(1080p\) \[([A-Fa-f0-9]{8})\]\.mkv$')
# Erai-raws keeps the same "title - episode" shape and the same 8-hex CRC, so the
# rest of the pipeline needs no new fields. Its third group is the source tag,
# which releases() reads to choose between the encodes it ships per episode.
ERAI = re.compile(r'^\[Erai-raws\] (.+) - (\d+(?:\.\d+)?) \[1080p ([^\]]*)\](?:\[MultiSub\])?\[([A-Fa-f0-9]{8})\]$')
TOKEN = re.compile(r'(\{[^}]*\}|\\[Nnh])')

def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))

def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temp.replace(path)

def fetch(url):
    allowed = {'animetosho.xyz', 'feed.animetosho.xyz', 'storage.animetosho.xyz'}
    def check(value):
        p = urllib.parse.urlparse(value)
        if p.scheme != 'https' or p.hostname not in allowed or p.username or p.password:
            raise ValueError('Unexpected download host')
    class Redirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            check(newurl)
            return super().redirect_request(req, fp, code, msg, headers, newurl)
    check(url)
    # Attachment filenames arrive unescaped from the feed; encode the path so
    # characters like spaces and brackets survive into the HTTP request.
    parts = urllib.parse.urlsplit(url)
    url = parts._replace(path=urllib.parse.quote(parts.path)).geturl()
    request = urllib.request.Request(url, headers={'User-Agent': 'SubtitlePipeline/1.0'})
    with urllib.request.build_opener(Redirect).open(request, timeout=40) as response:
        data = response.read(LIMIT + 1)
    if len(data) > LIMIT:
        raise ValueError('Download too large')
    return data

def releases(data):
    """The 1080p episodes in one group's feed, one entry per episode.

    SubsPlease publishes a single 1080p release per episode. Erai-raws publishes
    two to four - a WEB-DL beside a much smaller WEBRip re-encode, sometimes from
    two services - and they carry the same subtitle track, so the duplicates are
    collapsed here rather than queued and rejected one at a time downstream.
    WEB-DL wins because it is the untouched service rip; the WEBRip is only taken
    when nothing else covers that episode, which for several titles it is.
    """
    best = {}
    for item in ET.fromstring(data).findall('./channel/item'):
        title = item.findtext('title', '')
        link = urllib.parse.urlparse(item.findtext('link', ''))
        ident = re.fullmatch(r'/view/(\d+)', link.path)
        if not ident or link.hostname not in {'animetosho.xyz', 'animetosho.org'}:
            continue
        match = RELEASE.fullmatch(title)
        if match:
            name, episode, crc, rank = match[1], match[2], match[3], 0
        else:
            match = ERAI.fullmatch(title)
            if not match:
                continue
            name, episode, crc = match[1], match[2], match[4]
            rank = 1 if 'WEB-DL' in match[3] else 2
        # Episode numbers are compared numerically so "01" and "1" are one episode.
        key = (name, float(episode))
        if key in best and best[key][0] <= rank:
            continue
        best[key] = (rank, {
            'id': ident[1], 'release': title, 'title': name,
            'episode': episode, 'crc': crc.upper(),
            'published': email.utils.parsedate_to_datetime(item.findtext('pubDate')).timestamp()})
    return [entry for _, entry in best.values()]

def subtitle_url(meta, entry):
    """The one unforced English ASS attached to a confirmed 1080p file.

    A standalone release carries its attachments at the top level; inside a batch each
    file carries its own, so prefer the file's list and fall back to the release's.
    """
    info = entry.get('info', {})
    video = info.get('mediainfoj', {}).get('video', [])
    json_confirms_1080p = (len(video) == 1 and int(video[0].get('height', 0)) == 1080)
    text = info.get('mediainfo', '')
    blocks = [block for block in re.split(r'\r?\n\s*\r?\n', text.strip()) if block.strip()] if isinstance(text, str) else []
    text_video = [block for block in blocks
                  if re.fullmatch(r'Video(?:\s+#\d+)?', block.splitlines()[0].strip())]
    text_confirms_1080p = (len(text_video) == 1 and
                           re.search(r'(?m)^Height\s*:\s*1[ ,]?080 pixels\s*$', text_video[0]) is not None)
    if not json_confirms_1080p and not text_confirms_1080p:
        raise ValueError('Video metadata does not confirm 1080p')
    attachments = entry.get('attachments') or meta.get('attachments', [])
    candidates = [a for a in attachments if a.get('type') == 'subtitle'
                  and a.get('info', {}).get('language_code') == 'eng'
                  and str(a.get('info', {}).get('format', '')).upper() == 'ASS'
                  and not a.get('info', {}).get('forced')]
    if len(candidates) != 1:
        raise ValueError('Expected exactly one unforced English ASS track')
    return candidates[0]['url']

def attachment(meta, release):
    batched = release.get('fileId') is not None
    if str(meta.get('id')) != str(release.get('torrentId', release['id'])) or meta.get('deleted'):
        raise ValueError('Release metadata mismatch')
    if bool(meta.get('is_batch')) != batched:
        raise ValueError('Batch flag does not match the queued item')
    files = meta.get('files', [])
    if batched:
        # Pin to the exact file this item was expanded from, not to its position.
        chosen = [f for f in files if f.get('id') == release['fileId']]
        if len(chosen) != 1:
            raise ValueError('Queued batch file is no longer in the release')
    else:
        chosen = files
        if len(chosen) != 1:
            raise ValueError('Expected one matching episode file')
    if chosen[0].get('filename', chosen[0].get('name')) != release['release']:
        raise ValueError('Episode filename changed since it was queued')
    return subtitle_url(meta, chosen[0])

def decompress(data):
    decoder = lzma.LZMADecompressor(memlimit=128 * 1024 * 1024)
    raw = decoder.decompress(data, max_length=LIMIT + 1)
    if len(raw) > LIMIT or not decoder.eof or decoder.unused_data:
        raise ValueError('Oversized or malformed XZ attachment')
    raw.decode('utf-8-sig')
    return raw

def segments(raw):
    """Freeze everything except visible text; drawings and all ASS controls survive."""
    lines = raw.decode('utf-8-sig').splitlines(keepends=True)
    slots = []
    events = False
    for line_no, line in enumerate(lines):
        if line.strip().startswith('['):
            events = line.strip().lower() == '[events]'
        if events and line.startswith('Format:'):
            if [x.strip().lower() for x in line[7:].split(',')] != ['layer','start','end','style','name','marginl','marginr','marginv','effect','text']:
                raise ValueError('Unsupported ASS event format')
        if not events or not line.startswith('Dialogue:'):
            continue
        fields = line.rstrip('\r\n').split(',', 9)
        if len(fields) != 10:
            raise ValueError('Malformed dialogue')
        drawing = False
        for part_no, part in enumerate(TOKEN.split(fields[9])):
            if part.startswith('{'):
                for command in re.finditer(r'\\p(\d+)\b|\\r(?:[^\\}]*)', part):
                    drawing = bool(int(command.group(1))) if command.group(1) is not None else False
            elif not drawing and not TOKEN.fullmatch(part) and part.strip():
                slots.append({'id': f'{line_no}:{part_no}', 'speaker': fields[4], 'style': fields[3], 'text': part})
    if not slots:
        raise ValueError('No visible ASS dialogue')
    return lines, slots

def assemble(raw, translations):
    lines, slots = segments(raw)
    if set(translations) != {s['id'] for s in slots}:
        raise ValueError('Translation IDs missing or unexpected')
    for value in translations.values():
        if not isinstance(value, str) or not value.strip() or any(c in value for c in '{}\\\r\n\x00'):
            raise ValueError('Invalid text or injected ASS control')
    byline = {}
    for slot in slots:
        line_no, part_no = map(int, slot['id'].split(':'))
        byline.setdefault(line_no, {})[part_no] = translations[slot['id']]
    for line_no, changes in byline.items():
        line = lines[line_no]
        ending = line[len(line.rstrip('\r\n')):]
        fields = line.rstrip('\r\n').split(',', 9)
        parts = TOKEN.split(fields[9])
        for part_no, value in changes.items():
            parts[part_no] = value
        fields[9] = ''.join(parts)
        lines[line_no] = ','.join(fields) + ending
    result = ''.join(lines).encode('utf-8')
    return (b'\xef\xbb\xbf' if raw.startswith(b'\xef\xbb\xbf') else b'') + result

@contextlib.contextmanager
def lock(root):
    root.mkdir(parents=True, exist_ok=True)
    with (root / 'lock').open('a+b') as handle:
        handle.seek(0)
        handle.write(b'0')
        handle.flush()
        handle.seek(0)
        if __import__('os').name == 'nt':
            import msvcrt
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            if __import__('os').name == 'nt':
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--project', type=Path, required=True)
    parser.add_argument('command', choices=['init','scan','expand','status','prepare','build','publish'])
    parser.add_argument('id', nargs='?')
    parser.add_argument('--reviewed', action='store_true')
    args = parser.parse_args()
    project = args.project.resolve()
    root = project / '.subtitle-automation'
    helper = Path(__file__).with_name('project.mjs')
    with lock(root):
        statefile = root / 'state.json'
        if args.command == 'init':
            if not statefile.exists():
                write(statefile, {'since': dt.datetime.now(dt.timezone.utc).timestamp(), 'items': {}})
            print('Initialized; only episodes released from this point forward will be queued.')
            return
        state = read(statefile)
        def save():
            write(statefile, state)
        def node(command, *extra):
            result = subprocess.run(['node', str(helper), str(project), command, *extra], text=True, encoding='utf-8', capture_output=True)
            if result.returncode:
                raise RuntimeError(result.stderr.strip() or result.stdout.strip())
            return json.loads(result.stdout)
        if args.command == 'scan':
            # An episode both groups carry is queued twice: their titles are
            # romanised differently, so nothing here can join them. The duplicate
            # check in project.mjs resolves both to the same series and rejects
            # the second - at match time if the first is already published, at
            # publish time otherwise.
            for feed in FEEDS:
                for release in releases(fetch(feed)):
                    if release['published'] >= state['since'] and release['id'] not in state['items']:
                        state['items'][release['id']] = {**release, 'status': 'queued'}
            save()
        if args.command == 'expand':
            # Deliberate backfill only: the feed's history is finite, so a season that
            # aged out of it survives solely inside its batch. Never called by `scan`.
            if not args.id or not args.id.isdigit():
                raise ValueError('expand needs a batch release ID')
            meta = json.loads(fetch(f'https://feed.animetosho.xyz/json?id={args.id}&show=torrent'))
            if str(meta.get('id')) != args.id or meta.get('deleted'):
                raise ValueError('Release metadata mismatch')
            if not meta.get('is_batch'):
                raise ValueError('Not a batch; single releases arrive through scan')
            added, skipped = [], []
            for entry in meta.get('files', []):
                name = entry.get('filename') or entry.get('name') or ''
                parsed = BATCH_FILE.fullmatch(name)
                file_id = entry.get('id')
                if not parsed or not isinstance(file_id, int):
                    skipped.append(f'{name}: not a 1080p SubsPlease episode file')
                    continue
                key = str(file_id)
                if key in state['items']:
                    skipped.append(f"{name}: already {state['items'][key]['status']}")
                    continue
                try:
                    # Validate before queueing so a bad file never reaches the translator.
                    subtitle_url(meta, entry)
                except ValueError as error:
                    skipped.append(f'{name}: {error}')
                    continue
                state['items'][key] = {
                    'id': key, 'release': name, 'title': parsed[1], 'episode': parsed[2],
                    'crc': parsed[3].upper(), 'published': meta.get('timestamp', 0),
                    'status': 'queued', 'torrentId': args.id, 'fileId': file_id,
                    'batchReason': f'Expanded from batch release {args.id}: {meta.get("title")}',
                }
                added.append(f'{key}  {name}')
            save()
            print(json.dumps({'batch': args.id, 'title': meta.get('title'),
                              'added': added, 'skipped': skipped}, ensure_ascii=False, indent=2))
            return
        if args.command in {'scan', 'status'}:
            print(json.dumps(state, ensure_ascii=False, indent=2))
            return
        if not args.id or args.id not in state['items']:
            raise ValueError('Unknown queued release ID')
        item = state['items'][args.id]
        folder = root / args.id
        folder.mkdir(exist_ok=True)
        try:
            if args.command == 'prepare':
                if item['status'] == 'published':
                    print('Already published'); return
                filename = re.sub(r'[<>:"/\\|?*]', '', f"{item['title']} - {item['episode']}.sq.ass")
                match = node('match', filename)
                if match.get('duplicate'):
                    item.update(status='duplicate', match=match); save()
                    print(json.dumps(item)); return
                # A batch-expanded item is keyed by its file ID, so fetch its parent torrent.
                torrent = str(item.get('torrentId', args.id))
                meta = json.loads(fetch(f'https://feed.animetosho.xyz/json?id={torrent}&show=torrent'))
                # AniDB's series id, recorded for publish: it is per-season and it
                # is a real field here, where Anikoto only leaks an AniList id
                # through a banner image URL that many titles do not have.
                match['anidbId'] = meta.get('anidb_aid')
                write(folder / 'match.json', match)
                raw = decompress(fetch(attachment(meta, item)))
                _, slots = segments(raw)
                (folder / 'source.ass').write_bytes(raw)
                write(folder / 'source.json', slots)
                item.update(status='ready', sha256=hashlib.sha256(raw).hexdigest(), filename=filename)
            elif args.command == 'build':
                if not args.reviewed:
                    raise ValueError('Review translation for Albanian completeness and consistent names, then use --reviewed')
                raw = (folder / 'source.ass').read_bytes()
                if hashlib.sha256(raw).hexdigest() != item['sha256']:
                    raise ValueError('Source changed')
                translations = read(folder / 'sq.json')
                output = assemble(raw, translations)
                if output == raw:
                    raise ValueError('Untranslated output')
                (folder / 'translated.sq.ass').write_bytes(output)
                item.update(status='reviewed', translatedSha256=hashlib.sha256(output).hexdigest())
            elif args.command == 'publish':
                if item['status'] not in {'reviewed', 'publishing'}:
                    raise ValueError('Build and review first')
                output = (folder / 'translated.sq.ass').read_bytes()
                if hashlib.sha256(output).hexdigest() != item['translatedSha256']:
                    raise ValueError('Reviewed output changed')
                item['status'] = 'publishing'; save()
                result = node('publish', str(folder))
                item.update(status='published', commit=result['commit'])
            item.pop('error', None)
            save()
            print(json.dumps(item, ensure_ascii=False, indent=2))
        except Exception as error:
            item['error'] = str(error)
            save()
            raise

if __name__ == '__main__':
    main()
