import json
import unittest
import lzma
from pipeline import releases, attachment, decompress, segments, assemble, BATCH_FILE, RELEASE

class PipelineTests(unittest.TestCase):
    def test_only_single_subsplease_1080_releases(self):
        titles = ['[SubsPlease] Title - 01 (1080p) [ABCDEF12].mkv',
                  '[SubsPlease] Title - 01 (720p) [ABCDEF12].mkv',
                  '[Other] Title - 01 (1080p) [ABCDEF12].mkv',
                  '[SubsPlease] Title - 01-12 (1080p) [ABCDEF12].mkv']
        xml = '<rss><channel>' + ''.join(f'<item><title>{t}</title><link>https://animetosho.xyz/view/{i}</link><pubDate>Tue, 15 Sep 2026 01:00:00 +0000</pubDate></item>' for i,t in enumerate(titles)) + '</channel></rss>'
        self.assertEqual([r['id'] for r in releases(xml)], ['0'])

    def test_track_and_video_checks(self):
        item = {'id':'1','release':'title.mkv'}
        meta = {'id':1,'files':[{'filename':'title.mkv','info':{'mediainfoj':{'video':[{'height':1080}]}}}],
                'attachments':[{'type':'subtitle','info':{'language_code':'eng','format':'ASS'},'url':'url'}]}
        self.assertEqual(attachment(meta,item),'url')
        meta['attachments'] *= 2
        with self.assertRaises(ValueError): attachment(meta,item)
        meta['attachments'].pop()
        meta['files'][0]['info']['mediainfoj']['video'][0]['height'] = 720
        with self.assertRaises(ValueError): attachment(meta,item)

    def test_text_mediainfo_fallback_requires_one_explicit_1080p_video(self):
        item = {'id':'1','release':'title.mkv'}
        text = ('General\nFormat : Matroska\n\nVideo\nWidth : 1 920 pixels\n'
                'Height : 1 080 pixels\n\nAudio\nLanguage : Japanese')
        meta = {'id':1,'files':[{'filename':'title.mkv','info':{'mediainfo':text}}],
                'attachments':[{'type':'subtitle','info':{'language_code':'eng','format':'ASS'},'url':'url'}]}
        self.assertEqual(attachment(meta,item),'url')
        meta['files'][0]['info']['mediainfo'] = text.replace('1 080', '720')
        with self.assertRaises(ValueError): attachment(meta,item)
        meta['files'][0]['info']['mediainfo'] = text + '\n\nVideo #2\nHeight : 1 080 pixels'
        with self.assertRaises(ValueError): attachment(meta,item)

    def test_xz_validation(self):
        self.assertEqual(decompress(lzma.compress(b'text')),b'text')
        with self.assertRaises(ValueError): decompress(lzma.compress(b'text') + b'junk')

    def test_ass_structure_drawing_and_breaks(self):
        raw = b'\xef\xbb\xbf[Events]\r\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\nDialogue: 0,0:00:01.00,0:00:02.00,Default,Joe,0,0,0,,{\\i1}Hello\\Nworld{\\p1}m 0 0 l 2 2{\\p0}Okay\\hfriend\r\nComment: Leave this alone\r\n'
        _, slots = segments(raw)
        self.assertEqual([s['text'] for s in slots], ['Hello','world','Okay','friend'])
        translations = {s['id']:t for s,t in zip(slots,['Përshëndetje','botë','Mirë','mik'])}
        output = assemble(raw,translations)
        expected = raw.decode('utf-8').replace('Hello','Përshëndetje').replace('world','botë').replace('Okay','Mirë').replace('friend','mik').encode('utf-8')
        self.assertEqual(output,expected)
        translations.pop(next(iter(translations)))
        with self.assertRaises(ValueError): assemble(raw,translations)

    def batch_meta(self):
        """A two-episode batch: attachments hang off each file, not off the release."""
        def entry(file_id, name, url):
            return {'id':file_id,'filename':name,
                    'info':{'mediainfoj':{'video':[{'height':1080}]}},
                    'attachments':[{'type':'subtitle','info':{'language_code':'eng','format':'ASS'},'url':url}]}
        return {'id':900,'is_batch':True,'attachments':[],'files':[
            entry(11,'[SubsPlease] Title - 01v2 (1080p) [ABCDEF12].mkv','first'),
            entry(12,'[SubsPlease] Title - 02 (1080p) [ABCDEF13].mkv','second')]}

    def test_batch_filenames_allow_revisions_but_the_feed_pattern_does_not(self):
        revised = '[SubsPlease] Title - 01v2 (1080p) [ABCDEF12].mkv'
        self.assertEqual(BATCH_FILE.fullmatch(revised).group(2), '01')
        self.assertIsNone(RELEASE.fullmatch(revised), 'a v2 must not auto-queue from the feed')
        for bad in ['[SubsPlease] Title - 01 (720p) [ABCDEF12].mkv',
                    '[Other] Title - 01 (1080p) [ABCDEF12].mkv',
                    '[SubsPlease] Title - 01-12 (1080p) [ABCDEF12].mkv']:
            self.assertIsNone(BATCH_FILE.fullmatch(bad))

    def test_batch_item_resolves_its_own_file(self):
        meta = self.batch_meta()
        second = {'id':'12','torrentId':'900','fileId':12,
                  'release':'[SubsPlease] Title - 02 (1080p) [ABCDEF13].mkv'}
        self.assertEqual(attachment(meta, second), 'second')
        # Identity is the file ID, so reordering the release must not change the result.
        meta['files'].reverse()
        self.assertEqual(attachment(meta, second), 'second')

    def test_batch_item_rejects_drift_and_mismatch(self):
        meta = self.batch_meta()
        gone = {'id':'99','torrentId':'900','fileId':99,'release':'[SubsPlease] Title - 03 (1080p) [ABCDEF14].mkv'}
        with self.assertRaises(ValueError): attachment(meta, gone)
        renamed = {'id':'12','torrentId':'900','fileId':12,'release':'[SubsPlease] Title - 09 (1080p) [ABCDEF13].mkv'}
        with self.assertRaises(ValueError): attachment(meta, renamed)
        # A single-release item must never be served out of a batch, or vice versa.
        single = {'id':'900','release':'[SubsPlease] Title - 02 (1080p) [ABCDEF13].mkv'}
        with self.assertRaises(ValueError): attachment(meta, single)
        plain = {'id':'1','files':[{'filename':'title.mkv','info':{'mediainfoj':{'video':[{'height':1080}]}}}],
                 'attachments':[{'type':'subtitle','info':{'language_code':'eng','format':'ASS'},'url':'url'}]}
        with self.assertRaises(ValueError):
            attachment(plain, {'id':'1','torrentId':'1','fileId':5,'release':'title.mkv'})

    def test_batch_file_still_needs_one_unforced_english_ass(self):
        meta = self.batch_meta()
        item = {'id':'11','torrentId':'900','fileId':11,
                'release':'[SubsPlease] Title - 01v2 (1080p) [ABCDEF12].mkv'}
        self.assertEqual(attachment(meta, item), 'first')
        meta['files'][0]['attachments'][0]['info']['forced'] = True
        with self.assertRaises(ValueError): attachment(meta, item)
        meta['files'][0]['attachments'][0]['info']['forced'] = False
        meta['files'][0]['info']['mediainfoj']['video'][0]['height'] = 720
        with self.assertRaises(ValueError): attachment(meta, item)

    def test_reject_control_injection(self):
        raw = b'[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hello\n'
        _,slots = segments(raw)
        for text in ['{\\p1}m 0 0','x\\Ny','x\nDialogue:','']:
            with self.assertRaises(ValueError): assemble(raw,{slots[0]['id']:text})

if __name__ == '__main__': unittest.main()
