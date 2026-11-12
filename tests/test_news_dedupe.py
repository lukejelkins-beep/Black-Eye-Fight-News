"""Offline regression checks: python3 -m unittest discover -s tests -p 'test_news_dedupe.py'"""
import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from news_dedupe import canonical_url, duplicate_of, deduplicate

def article(title,url,when='2026-11-12T01:00:00+00:00',sport='mma',**extra):
    return dict(title=title,url=url,publishedAt=when,sport=sport,**extra)

class NewsDedupeTests(unittest.TestCase):
    def test_tracking_links_are_identical(self):
        a='https://www.example.com/news/fight?utm_source=instagram&fbclid=abc'
        b='https://example.com/news/fight'
        self.assertEqual(canonical_url(a),canonical_url(b))

    def test_same_article_different_tracking_links(self):
        a=article('Fighter reveals plans','https://example.com/a?utm_source=x')
        b=article('Fighter reveals plans','https://www.example.com/a')
        self.assertTrue(duplicate_of(a,b))
        self.assertEqual(len(deduplicate([a,b])[0]),1)

    def test_syndicated_title_same_event(self):
        a=article('Champion confirms heavyweight title fight against contender in July',
                  'https://one.example/sports/1')
        b=article('Champion confirms heavyweight title fight against contender in July',
                  'https://two.example/story/2')
        self.assertTrue(duplicate_of(a,b))

    def test_different_developments_not_duplicate(self):
        a=article('Champion confirms heavyweight title fight against contender in July',
                  'https://one.example/1')
        b=article('Champion withdraws from heavyweight title fight against contender in July',
                  'https://two.example/2')
        self.assertFalse(duplicate_of(a,b))

    def test_same_fighter_different_fights_not_duplicate(self):
        a=article('John Smith knocks out Mark Jones in second round at UFC event',
                  'https://one.example/1')
        b=article('John Smith knocks out David Brown in second round at UFC event',
                  'https://two.example/2')
        self.assertFalse(duplicate_of(a,b))

    def test_different_sports_not_duplicate(self):
        a=article('Champion confirms heavyweight title fight against contender in July',
                  'https://one.example/1',sport='boxing')
        b=article('Champion confirms heavyweight title fight against contender in July',
                  'https://two.example/2',sport='mma')
        self.assertFalse(duplicate_of(a,b))

    def test_distant_follow_up_not_duplicate(self):
        a=article('Champion confirms heavyweight title fight against contender in July',
                  'https://one.example/1')
        b=article('Champion confirms heavyweight title fight against contender in July',
                  'https://two.example/2',when='2026-11-18T01:00:00+00:00')
        self.assertFalse(duplicate_of(a,b))

    def test_anik_extension_across_publishers(self):
        mma=article('UFC announcer Jon Anik signs long-term contract extension',
                    'https://www.mmafighting.com/ufc/520497/ufc-announcer-jon-anik-signs-long-term-contract-extension')
        ufc=article('JON ANIK SIGNS MULTI-YEAR EXTENSION TO CONTINUE ROLE ON UFC BROADCAST TEAM',
                    'https://www.ufc.com/news/jon-anik-signs-multi-year-extension-continue-role-ufc-broadcast-team')
        self.assertTrue(duplicate_of(mma,ufc))
        self.assertEqual(len(deduplicate([mma,ufc])[0]),1)

    def test_different_contract_people_stay_separate(self):
        anik=article('UFC announcer Jon Anik signs long-term contract extension','https://one.example/1')
        joe=article('UFC announcer Joe Rogan signs long-term contract extension','https://two.example/2')
        self.assertFalse(duplicate_of(anik,joe))

    def test_prefer_complete_story(self):
        a=article('Champion confirms heavyweight title fight against contender in July',
                  'https://one.example/1')
        b=article('Champion confirms heavyweight title fight against contender in July',
                  'https://two.example/2',image={'url':'https://two.example/photo.jpg'},
                  summaryPoints=['Detail one','Detail two','Detail three'])
        kept,rejected=deduplicate([a,b])
        self.assertEqual(kept[0]['url'],b['url'])
        self.assertEqual(rejected[0]['keptUrl'],b['url'])

if __name__=='__main__':unittest.main()
