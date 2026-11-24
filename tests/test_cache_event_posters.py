import importlib.util, io, json, tempfile, unittest
from pathlib import Path
from PIL import Image

spec = importlib.util.spec_from_file_location('posters', Path(__file__).resolve().parents[1] / 'scripts/cache-event-posters.py')
posters = importlib.util.module_from_spec(spec)
spec.loader.exec_module(posters)


def png(w, h):
    buf = io.BytesIO()
    Image.new('RGB', (w, h), (200, 30, 40)).save(buf, 'PNG')
    return buf.getvalue()


class PosterCacheTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / 'data').mkdir()
        (self.root / 'assets').mkdir()
        upcoming = {'events': [
            {'id': 'ufc-334-2026-11-14', 'source': 'https://www.ufc.com/event/ufc-334',
             'posterPortrait': {'url': 'https://example.com/334-portrait.jpg', 'source': 'https://example.com/334', 'credit': 'UFC'},
             'posterLandscape': {'url': 'https://example.com/334-wide.jpg', 'source': 'https://example.com/334w', 'credit': 'UFC'}},
            {'id': 'bad id with spaces', 'poster': {'url': 'https://example.com/x.jpg'}},
            {'id': 'pfl-dubai-2026-11-14', 'poster': {'url': 'https://example.com/broken.jpg', 'source': 'https://example.com/pfl'}},
        ]}
        (self.root / 'data/upcoming-cards.json').write_text(json.dumps(upcoming))
        self.calls = []

    def tearDown(self):
        self.tmp.cleanup()

    def fetch(self, url):
        self.calls.append(url)
        if 'broken' in url:
            raise ValueError('not an image: text/html')
        return png(1600, 2400) if 'portrait' in url else png(2000, 1000)

    def test_caches_resized_webp_and_register(self):
        report = posters.run(self.fetch, self.root)
        self.assertIn('cached: ufc-334-2026-11-14 portrait 900x1350', report)
        self.assertIn('cached: ufc-334-2026-11-14 landscape 1280x640', report)
        self.assertTrue(any(r.startswith('failed: pfl-dubai') for r in report))
        files = sorted(p.name for p in (self.root / 'assets/img/posters').iterdir())
        self.assertEqual(files, ['ufc-334-2026-11-14-landscape.webp', 'ufc-334-2026-11-14-portrait.webp'])
        reg = json.loads((self.root / 'data/poster-register.json').read_text())
        entry = reg['events']['ufc-334-2026-11-14']['portrait']
        self.assertEqual(entry['imageUrl'], 'https://example.com/334-portrait.jpg')
        self.assertIn('owner-cleared', entry['rights'])
        js = (self.root / 'assets/local-posters.js').read_text()
        self.assertIn('"url":"assets/img/posters/ufc-334-2026-11-14-portrait.webp"', js)
        self.assertNotIn('bad id', js)

    def test_second_run_downloads_nothing_new_and_gives_up_after_three_failures(self):
        posters.run(self.fetch, self.root)
        self.calls.clear()
        posters.run(self.fetch, self.root)
        self.assertEqual(self.calls, ['https://example.com/broken.jpg'])
        posters.run(self.fetch, self.root)
        self.calls.clear()
        posters.run(self.fetch, self.root)
        self.assertEqual(self.calls, [])

    def test_reads_eye_checked_intake_without_touching_the_schedule(self):
        intake = {'events': {'ksw-124-2026-12-19': [
            {'url': 'https://example.com/ksw124-wide.jpg', 'source': 'https://www.kswmma.com/gala/xtb-ksw-124',
             'credit': 'KSW event artwork', 'orientation': 'landscape', 'width': 1920, 'height': 1080}]},
            'rejected': [{'eventId': 'ksw-124-2026-12-19', 'url': 'https://example.com/fan-edit.jpg'}]}
        (self.root / 'data/poster-intake.json').write_text(json.dumps(intake))
        before = (self.root / 'data/upcoming-cards.json').read_text()
        report = posters.run(self.fetch, self.root)
        self.assertIn('cached: ksw-124-2026-12-19 landscape 1280x640', report)
        self.assertNotIn('https://example.com/fan-edit.jpg', self.calls)
        self.assertEqual((self.root / 'data/upcoming-cards.json').read_text(), before)
        reg = json.loads((self.root / 'data/poster-register.json').read_text())
        self.assertEqual(reg['events']['ksw-124-2026-12-19']['landscape']['credit'], 'KSW event artwork')

    def test_rejects_tiny_images(self):
        with self.assertRaises(ValueError):
            posters.process(png(120, 120), 'portrait')


if __name__ == '__main__':
    unittest.main()
