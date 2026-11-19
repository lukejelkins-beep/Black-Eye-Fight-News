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

    def test_reworded_backup_fighter_announcement(self):
        a=article("Brandon Royval says he's UFC 336 backup for Van vs. Kape title fight",'https://one.example/royval')
        b=article("Brandon Royval says he's UFC 336 backup for Joshua Van vs. Manel Kape",'https://two.example/royval')
        self.assertTrue(duplicate_of(a,b))

    def test_reworded_overeem_booking(self):
        a=article('Alistair Overeem to make boxing debut vs. Jimi Manuwa on Jake Paul card',
                  'https://one.example/overeem',sport='boxing')
        b=article('Alistair Overeem vs. Jimi Manuwa added to Paul vs. Doumbe fight card',
                  'https://two.example/overeem',sport='boxing')
        self.assertTrue(duplicate_of(a,b))

    def test_matching_press_conference_video(self):
        a=article('UFC 334 press conference video','https://one.example/press')
        b=article("Video: UFC 334 Gane vs Hokit pre-fight press conference live stream",
                  'https://two.example/press')
        self.assertTrue(duplicate_of(a,b))

    def test_distinct_media_day_and_press_conference(self):
        a=article('UFC 334 press conference video','https://one.example/press')
        b=article('UFC 334 media day video','https://two.example/media')
        self.assertFalse(duplicate_of(a,b))

    def test_distinct_headline_angles_on_same_card(self):
        a=article('Coach Conversation | Polymarket UFC 334: Ciryl Gane vs Josh Hokit',
                  'https://one.example/coach')
        b=article('UFC 334 Countdown video, Ciryl Gane vs Josh Hokit heavyweight title',
                  'https://two.example/countdown')
        self.assertFalse(duplicate_of(a,b))

    def test_declined_offer_is_new_development(self):
        a=article('Dana White offered press secretary job by President Donald Trump',
                  'https://one.example/offer')
        b=article('Dana White turns down press secretary role, President Trump admits he was kidding',
                  'https://two.example/decline')
        self.assertFalse(duplicate_of(a,b))

    def test_prefer_complete_story(self):
        a=article('Champion confirms heavyweight title fight against contender in July',
                  'https://one.example/1')
        b=article('Champion confirms heavyweight title fight against contender in July',
                  'https://two.example/2',image={'url':'https://two.example/photo.jpg'},
                  summaryPoints=['Detail one','Detail two','Detail three'])
        kept,rejected=deduplicate([a,b])
        self.assertEqual(kept[0]['url'],b['url'])
        self.assertEqual(rejected[0]['keptUrl'],b['url'])



class CoverageAndLeadsTests(unittest.TestCase):
    NOW=__import__('datetime').datetime(2026,11,19,4,0,tzinfo=__import__('datetime').timezone.utc)

    def story(self,title,url,source,hours_ago,image=True):
        import datetime
        when=(self.NOW-datetime.timedelta(hours=hours_ago)).isoformat()
        a=article(title,url,when=when,source=source)
        if image:a['image']={'url':url+'.jpg'}
        return a

    def test_same_story_from_three_sources_is_counted_once_with_coverage(self):
        from news_dedupe import deduplicate
        items=[
            self.story('Champion confirms heavyweight title fight against contender in July','https://a.test/1','MMA Fighting',5),
            self.story('Champion confirms heavyweight title fight against contender in July','https://b.test/1','Sherdog',4),
            self.story('Champion confirms heavyweight title fight against contender in July','https://c.test/1','MMA Weekly',3),
            self.story('Different story entirely about a boxing rematch','https://d.test/1','World Boxing News',2),
        ]
        kept,rejected=deduplicate(items)
        self.assertEqual(len(kept),2)
        top=max(kept,key=lambda a:a['coverage'])
        self.assertEqual(top['coverage'],3)
        self.assertEqual(len(top['alsoCoveredBy']),2)
        self.assertEqual([a['coverage'] for a in kept if a is not top],[1])

    def test_leads_are_newest_and_most_covered_and_never_the_same_story(self):
        from news_dedupe import pick_leads
        old_big=self.story('Big story','https://a.test/big','A',30); old_big['coverage']=4
        newest=self.story('Fresh','https://a.test/new','B',1); newest['coverage']=1
        small=self.story('Small','https://a.test/small','C',6); small['coverage']=1
        leads=pick_leads([old_big,newest,small],self.NOW)
        self.assertEqual(leads['newest'],'https://a.test/new')
        self.assertEqual(leads['mostCovered'],'https://a.test/big')

    def test_most_covered_is_not_repeated_as_newest(self):
        from news_dedupe import pick_leads
        both=self.story('Both','https://a.test/both','A',1); both['coverage']=5
        other=self.story('Other','https://a.test/other','B',9); other['coverage']=2
        leads=pick_leads([both,other],self.NOW)
        self.assertEqual(leads['newest'],'https://a.test/both')
        self.assertEqual(leads['mostCovered'],'https://a.test/other')

    def test_no_lead_when_nothing_is_fresh_or_nothing_is_shared(self):
        from news_dedupe import pick_leads
        stale=self.story('Old','https://a.test/old','A',100)
        self.assertEqual(pick_leads([stale],self.NOW),{'newest':None,'mostCovered':None})
        solo=self.story('Solo','https://a.test/solo','A',2); solo['coverage']=1
        self.assertIsNone(pick_leads([solo],self.NOW)['mostCovered'])


if __name__=='__main__':
    unittest.main()
