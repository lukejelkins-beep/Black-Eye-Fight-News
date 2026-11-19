"""Offline tests for scripts/sumo-portrait-intake.py (no network).
Run: python3 -m unittest tests/test_sumo_portrait_intake.py"""
import importlib.util, os, unittest

spec = importlib.util.spec_from_file_location(
    'intake', os.path.join(os.path.dirname(__file__), '..', 'scripts', 'sumo-portrait-intake.py'))
intake = importlib.util.module_from_spec(spec)
spec.loader.exec_module(intake)

# Synthetic page with the same structure as a JSA profile (not a copy of one).
PAGE = '''<div class="mdColSet1">
<img src="/img/sumo_data/rikishi/270x474/20990001.jpg" width="270" height="474" alt="" class="col1">
<div class="col2"><table class="mdTable2">
<tr><td colspan="2" class="fntXL"> Testyama Taro </td></tr>
<tr class="line1"><th>Stable</th><td><a href="/x/">Examplebeya</a></td></tr>
</table></div></div>
<img src="/img/sumo_data/rikishi/60x60/20990002.jpg">'''


class ParseTests(unittest.TestCase):
    def test_reads_large_portrait_name_and_stable(self):
        p = intake.parse_profile(PAGE)
        self.assertEqual(p['portraitPath'], '/img/sumo_data/rikishi/270x474/20990001.jpg')
        self.assertEqual(p['name'], 'Testyama Taro')
        self.assertEqual(p['stable'], 'Examplebeya')

    def test_no_large_portrait_means_none(self):
        self.assertIsNone(intake.parse_profile('<img src="/img/sumo_data/rikishi/60x60/1.jpg">'))


class IdentityTests(unittest.TestCase):
    p = intake.parse_profile(PAGE)

    def test_matching_ring_name_and_stable(self):
        self.assertTrue(intake.identity_ok(self.p, {'shikonaEn': 'Testyama', 'heya': 'Examplebeya'}))

    def test_macrons_and_case_are_ignored(self):
        self.assertTrue(intake.identity_ok(self.p, {'shikonaEn': 'TESTYAMA', 'heya': 'examplebeya'}))

    def test_different_ring_name_fails_closed(self):
        self.assertFalse(intake.identity_ok(self.p, {'shikonaEn': 'Otheryama', 'heya': 'Examplebeya'}))

    def test_different_stable_fails_closed(self):
        self.assertFalse(intake.identity_ok(self.p, {'shikonaEn': 'Testyama', 'heya': 'Elsewhere'}))

    def test_missing_page_name_fails_closed(self):
        self.assertFalse(intake.identity_ok({'name': None}, {'shikonaEn': 'Testyama'}))


class JpegTests(unittest.TestCase):
    def test_rejects_non_jpeg(self):
        with self.assertRaises(ValueError):
            intake.check_jpeg(b'<html>not an image</html>')

    def test_rejects_wrong_size(self):
        import io
        from PIL import Image
        buf = io.BytesIO()
        Image.new('RGB', (60, 60)).save(buf, 'JPEG')
        with self.assertRaises(ValueError):
            intake.check_jpeg(buf.getvalue())

    def test_accepts_official_size(self):
        import io
        from PIL import Image
        buf = io.BytesIO()
        Image.new('RGB', (270, 474)).save(buf, 'JPEG')
        intake.check_jpeg(buf.getvalue())


if __name__ == '__main__':
    unittest.main()
