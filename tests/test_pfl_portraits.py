"""Official portrait provenance safeguards: exact athlete name and official PFL CDN."""
import importlib.util
import pathlib
import unittest
import datetime as dt

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("pfl_portraits",ROOT/"scripts/enrich-pfl-official-portraits.py")
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)

GOOD = '<html><head><title>Thad Jean | Welterweight (170)</title></head><body><img alt="Fighter" src="https://pflmma-prod.s3.amazonaws.com/fighters/bodyshots/verified-portrait.png"><img alt="Fighter Headshot" src="https://pflmma-prod.s3.amazonaws.com/fighters/headshots/someoneelse.png"></body></html>'

class PFLPortraitTests(unittest.TestCase):
    def test_exact_name_and_hero_image(self):
        self.assertEqual(m.verify_profile(GOOD,"Thad Jean"),
                         "https://pflmma-prod.s3.amazonaws.com/fighters/bodyshots/verified-portrait.png")
        self.assertIsNone(m.verify_profile(GOOD,"Jean Thad"))
        self.assertIsNone(m.verify_profile(GOOD,"Thad Smith"))

    def test_unsafe_image_is_rejected(self):
        self.assertIsNone(m.verify_profile('<title>Thad Jean | MMA</title><img alt="Fighter" src="https://untrusted.example/fighters/bodyshots/1.png">',"Thad Jean"))
        self.assertIsNone(m.verify_profile('<title>Thad Jean | MMA</title><img alt="Fighter Headshot" src="https://pflmma-prod.s3.amazonaws.com/fighters/headshots/other.png">',"Thad Jean"))

    def test_photo_applied_only_to_correct_fighter(self):
        data={"results":[{"eventId":"pfl-2026-07-25-washington-dc",
                          "fighters":[{"name":"Thad Jean"},{"name":"Ernesto Rodriguez"}]}]}
        roster=[{"name":"Thad Jean"}]
        matched=[{"picture":"https://pflmma-prod.s3.amazonaws.com/fighters/bodyshots/verified-portrait.png","source":"https://pflmma.com/regular-fighter/thad-jean"}]
        self.assertEqual(m.apply(data,roster,matched),1)
        self.assertIn("photo",data["results"][0]["fighters"][0])
        self.assertNotIn("photo",data["results"][0]["fighters"][1])

    def test_retry_skips_recently_checked_missing(self):
        data={"results":[{"eventId":"pfl-test","order":0,"fighters":[{"name":"Thad Jean"}]}]}
        state={"attempts":{"thadjean":{"date":"2026-11-11","found":False}}}
        self.assertFalse(m.candidates(data,state,dt.date(2026,11,11)))
        self.assertEqual(len(m.candidates(data,state,dt.date(2026,11,26))),1)

if __name__=="__main__":
    unittest.main()
