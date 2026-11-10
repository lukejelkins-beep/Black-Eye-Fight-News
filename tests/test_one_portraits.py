"""ONE photo matching tests: never use an unrelated athlete or a generic graphic."""
import datetime as dt
import importlib.util
import pathlib
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location("onephoto",ROOT/"scripts/enrich-one-official-portraits.py")
m=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(m)

HTML='''<html><head><title>Taiki Naito - ONE Championship</title>
<meta property="og:image" content="https://cdn.onefc.com/wp-content/uploads/2020/02/Taiki-Naito.webp"></head>
<body><h2>About Taiki Naito</h2></body></html>'''

class OnePortraitTests(unittest.TestCase):
    def test_attributed_athlete_open_graph(self):
        self.assertEqual(m.verify(HTML,"Taiki Naito"),"https://cdn.onefc.com/wp-content/uploads/2020/02/Taiki-Naito.webp")
        self.assertIsNone(m.verify(HTML,"Kongthoranee Sor Sommai"))

    def test_requires_athlete_name_in_image(self):
        src='''<h2>About Taiki Naito</h2><meta property="og:image"
            content="https://cdn.onefc.com/wp-content/uploads/default-share.jpg">'''
        self.assertIsNone(m.verify(src,"Taiki Naito"))

    def test_reject_wrong_same_named_athlete(self):
        page='''<h2>About Magomed Magomedov</h2>
        <img alt="Magomed Magomedov" src="https://cdn.onefc.com/wp-content/uploads/Magomed-Magomedov.jpg">'''
        self.assertIsNone(m.verify(page,"Magomed Magomedov",["Lucas Gabriel"]))
        self.assertTrue(m.verify(page+"<p>Lucas Gabriel</p>","Magomed Magomedov",["Lucas Gabriel"]))

    def test_short_official_profile_alias_still_requires_matching_identity(self):
        official='''<html><head><meta property="og:image"
        content="https://cdn.onefc.com/wp-content/uploads/2025/03/Stamp-Fairtex.jpg"></head>
        <body><h2>About Stamp Fairtex</h2></body></html>'''
        urls=m.profile_urls("Stamp Fairtex")
        self.assertIn("https://www.onefc.com/athletes/stamp/",urls)
        seen=[]
        def get(url):
            seen.append(url)
            return official if url.endswith("/stamp/") else ""
        item={"name":"Stamp Fairtex","opponents":set()}
        match=m.inspect(item,get)
        self.assertEqual(match["source"],"https://www.onefc.com/athletes/stamp/")
        self.assertEqual(match["photo"],"https://cdn.onefc.com/wp-content/uploads/2025/03/Stamp-Fairtex.jpg")
        self.assertIsNone(m.inspect({"name":"Different Athlete","opponents":set()},lambda url:official))
        self.assertGreaterEqual(len(seen),2)

    def test_only_applies_to_one(self):
        data={"results":[
            {"eventId":"one-test","fighters":[{"name":"Taiki Naito"},{"name":"Fighter B"}]},
            {"eventId":"pfl-test","fighters":[{"name":"Taiki Naito"}]}
        ]}
        roster=[{"name":"Taiki Naito"}]
        found=[{"photo":"https://cdn.onefc.com/wp-content/uploads/Taiki-Naito.jpg",
                "source":"https://www.onefc.com/athletes/taiki-naito/"}]
        self.assertEqual(m.assign(data,roster,found),1)
        self.assertNotIn("photo",data["results"][1]["fighters"][0])

    def test_retry_window_for_unverified_profiles(self):
        d={"results":[{"eventId":"one-test","date":"2026-11-07","order":0,
                        "fighters":[{"name":"Taiki Naito"},{"name":"Example Athlete"}]}]}
        state={"attempts":{"taikinaito":{"date":"2026-11-11","found":False}}}
        self.assertNotIn("Taiki Naito",[x["name"] for x in m.due(d,state,dt.date(2026,11,11))])
        self.assertIn("Taiki Naito",[x["name"] for x in m.due(d,state,dt.date(2026,11,26))])

if __name__=="__main__":
    unittest.main()
