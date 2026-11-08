"""Offline poster-discovery safety checks. No external requests."""
from __future__ import annotations
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("poster_scout", Path("scripts/source-event-posters.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def event():
    return {
        "id": "test-card", "date": "2099-01-01",
        "title": "Fighter One vs Fighter Two",
        "bouts": [{"section": "main", "fighters": ["Fighter One", "Fighter Two"]}],
        "source": "https://www.ufc.com/event/sample"
    }

class PosterChecks(unittest.TestCase):
    def test_correct_fighters_required(self):
        e = event()
        self.assertTrue(mod.matches_event(e, "Fighter One vs Fighter Two: official fight poster"))
        self.assertFalse(mod.matches_event(e, "Fighter One vs Fighter Three"))
        self.assertFalse(mod.matches_event(e, "Fighter Three and Fighter Four"))
    def test_photo_dimensions(self):
        self.assertEqual(mod.poster_shape((800, 1100)), "posterPortrait")
        self.assertEqual(mod.poster_shape((800, 800)), "posterList")
        self.assertEqual(mod.poster_shape((1159, 420)), "")
        self.assertEqual(mod.poster_shape((160, 220)), "")
    def test_never_overwrite_good_poster(self):
        e = event()
        e["posterPortrait"] = {"url": "https://example.com/already-approved.jpg"}
        result = {"selected": {"field": "posterList", "url": "https://example.com/new.jpg",
            "source": "https://www.ufc.com/event/example", "credit": "Test",
            "kind": "Square event poster", "width": 800, "height": 800}}
        self.assertFalse(mod.future_unresolved(e, "2098-01-01"))
        self.assertFalse(mod.apply_result(e, result))
        self.assertNotIn("posterList", e)
        self.assertEqual(e["posterPortrait"]["url"], "https://example.com/already-approved.jpg")
    def test_event_date_must_match(self):
        e = event()
        e['date'] = '2099-02-01'
        body = """<html><head><title>Fighter One vs Fighter Two Event</title>
             <meta property="og:image" content="https://cdn.ufc.com/event-poster.jpg"></head>
             <body><h1>Fighter One vs Fighter Two</h1>
             <p>Event: 1 February 2099</p></body></html>"""
        self.assertTrue(mod.date_matches_event(e, body))
        self.assertEqual(len(mod.candidates_from_page(e, e["source"], body)), 1)
        self.assertFalse(mod.date_matches_event(e, body.replace("February", "January")))
        self.assertEqual(mod.candidates_from_page(e, e["source"],
                         body.replace("February", "January")), [])
        self.assertTrue(mod.date_matches_event(e, '<time datetime="2099-02-01T10:00:00Z"></time>'))
    def test_generic_promoter_og_image_is_not_event_art(self):
        e = event()
        body = """<html><head><title>Fighter One vs Fighter Two</title>
          <meta property="og:image" content="https://cdn.ufc.com/promoter-logo.jpg"></head>
          <body>1 February 2099</body></html>"""
        self.assertEqual(mod.candidates_from_page(e, e["source"], body), [])

    def test_no_poster_keeps_fallback(self):
        e = event()
        e["posterLandscape"] = {"url": "https://example.com/old-banner.jpg"}
        self.assertTrue(mod.future_unresolved(e, "2099-01-01"))
        self.assertFalse(mod.apply_result(e, {"selected": None}))
        self.assertEqual(e["posterLandscape"]["url"], "https://example.com/old-banner.jpg")
    def test_official_meta_image_and_bad_source(self):
        e = event()
        e['date'] = '2099-02-01'
        html = """<html><head><title>Fighter One vs Fighter Two | UFC</title>
          <meta property="og:image" content="https://cdn.ufc.com/fighter-one-vs-fighter-two-poster.jpg"></head>
          <body><p>1 February 2099</p><img src="https://example.com/site-logo.png" alt="logo"></body></html>"""
        c = mod.candidates_from_page(e, e["source"], html)
        self.assertTrue(any("poster.jpg" in x[0] for x in c))
        self.assertFalse(any("logo" in x[0] for x in c))
        self.assertEqual(mod.candidates_from_page(e, e["source"],
            html.replace("Fighter Two", "Fighter Three")), [])
    def test_source_whitelist(self):
        self.assertTrue(mod.trusted("https://www.ufc.com/event/123"))
        self.assertFalse(mod.trusted("https://notufc.com/other"))
        self.assertFalse(mod.trusted("http://ufc.com/not-secure"))

if __name__ == "__main__":
    unittest.main()
