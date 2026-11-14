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


    def test_mike_perry_return_signing_pair(self):
        a=article('Mike Perry re-signs with UFC','https://one.example/perry')
        b=article('UFC signs Mike Perry after five-year split','https://two.example/perry')
        self.assertTrue(duplicate_of(a,b))
        kept,rejected=deduplicate([a,b])
        self.assertEqual((len(kept),len(rejected)),(1,1))
        self.assertTrue(duplicate_of(b,a))

    def test_return_signing_rumour_is_not_confirmation(self):
        a=article('Mike Perry reportedly re-signs with UFC','https://one.example/perry')
        b=article('UFC signs Mike Perry after five-year split','https://two.example/perry')
        self.assertFalse(duplicate_of(a,b))

    def test_contract_extension_rumour_is_not_confirmation(self):
        a=article('Mike Perry reportedly re-signs with UFC','https://one.example/perry')
        b=article('Mike Perry re-signs with UFC','https://two.example/perry')
        self.assertFalse(duplicate_of(a,b))

    def test_return_signing_offer_or_rejection_stays_separate(self):
        signed=article('UFC signs Mike Perry after five-year split','https://three.example/perry')
        for i,headline in enumerate((
            'Mike Perry offered UFC contract after five-year split',
            'Mike Perry rejects UFC return offer after five-year split'
        )):
            with self.subTest(headline=headline):
                self.assertFalse(duplicate_of(article(headline,f'https://one.example/{i}'),signed))

    def test_return_signing_different_fighter_or_promotion(self):
        a=article('Mike Perry re-signs with UFC','https://one.example/perry')
        self.assertFalse(duplicate_of(a,article(
            'UFC signs Jake Perry after five-year split','https://two.example/jake')))
        self.assertFalse(duplicate_of(a,article(
            'PFL signs Mike Perry after five-year split','https://two.example/pfl')))
        self.assertFalse(duplicate_of(a,article(
            'Mike Perry re-signs with PFL','https://two.example/pfl2')))

    def test_return_signing_not_later_booking_or_new_role(self):
        a=article('Mike Perry re-signs with UFC','https://one.example/perry')
        self.assertFalse(duplicate_of(a,article(
            'UFC books Mike Perry against another fighter','https://two.example/booking')))
        self.assertFalse(duplicate_of(a,article(
            'UFC signs Mike Perry after five-year split and booked fight announced',
            'https://two.example/booking-after-signing')))
        self.assertFalse(duplicate_of(a,article(
            'UFC signs Mike Perry for commentary role after five-year split',
            'https://two.example/commentary')))

    def test_return_signing_outside_time_window_is_new_development(self):
        a=article('Mike Perry re-signs with UFC','https://one.example/perry')
        b=article('UFC signs Mike Perry after five-year split','https://two.example/perry',
                  when='2026-11-18T01:00:00+00:00')
        self.assertFalse(duplicate_of(a,b))

if __name__=='__main__':unittest.main()
