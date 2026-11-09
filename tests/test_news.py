import importlib.util,datetime as dt,unittest
spec=importlib.util.spec_from_file_location('news','scripts/refresh-news.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class FeedTests(unittest.TestCase):
 def test_dates_and_links(self):
  xml=b'<rss><channel><item><title>Title confirmed</title><link>https://example.com/news</link><pubDate>Sun, 08 Nov 2026 10:00:00 GMT</pubDate></item><item><title>Bad</title><link>javascript:alert(1)</link><pubDate>Sun, 08 Nov 2026 10:00:00 GMT</pubDate></item><item><title>Undated</title><link>https://example.com/b</link></item></channel></rss>'
  result=m.parse_feed(xml,'Test','boxing',dt.datetime(2026,11,8,11,tzinfo=dt.timezone.utc));self.assertEqual(len(result),1);self.assertGreater(result[0]['score'],0)
 def test_atom_and_stale(self):
  xml=b'<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>MMA result</title><link href="https://example.com/a"/><published>2026-11-08T09:00:00Z</published></entry><entry><title>Old</title><link href="https://example.com/old"/><published>2020-01-01T00:00:00Z</published></entry></feed>'
  self.assertEqual(len(m.parse_feed(xml,'Test','mma',dt.datetime(2026,11,8,11,tzinfo=dt.timezone.utc))),1)

class MMAJunkieTests(unittest.TestCase):
 def test_mma_junkie_source(self):
  self.assertTrue(any(name=='MMA Junkie' and sport=='mma' for name,sport,url in m.SOURCES))
 def test_google_news_only_uses_verified_junkie_source(self):
  feed=b'<rss><channel><item><title>Verified interview - MMA Junkie</title><link>https://news.google.com/rss/articles/one</link><pubDate>Mon, 09 Nov 2026 04:10:00 GMT</pubDate><source url="https://mmajunkie.usatoday.com">MMA Junkie</source></item><item><title>Wrong publisher</title><link>https://news.google.com/rss/articles/two</link><pubDate>Mon, 09 Nov 2026 04:10:00 GMT</pubDate><source url="https://example.com">Other</source></item></channel></rss>'
  rows=m.mma_junkie_google_feed(feed,dt.datetime(2026,11,9,6,tzinfo=dt.timezone.utc))
  self.assertEqual(len(rows),1)
  self.assertEqual(rows[0]['title'],'Verified interview')
  self.assertEqual(rows[0]['timeBasis'],'Google News feed timestamp')

class GdeltFallbackTests(unittest.TestCase):
 def test_verified_direct_article_links_with_index_time(self):
  raw=b'{"articles":[{"url":"https://mmajunkie.usatoday.com/story/sports/ufc/2026/11/09/fighter-update/12345/","title":"Fighter confirms next bout","seendate":"20261109T040000Z"},{"url":"https://unrelated.example.com/story/test","title":"Bad source","seendate":"20261109T040000Z"}]}'
  items=m.mma_junkie_gdelt(raw,dt.datetime(2026,11,9,6,tzinfo=dt.timezone.utc))
  self.assertEqual(len(items),1)
  self.assertEqual(items[0]['source'],'MMA Junkie')
  self.assertEqual(items[0]['sourceMethod'],'GDELT indexed MMA Junkie original')
  self.assertEqual(items[0]['timeBasis'],'GDELT first-seen timestamp')
  self.assertTrue(items[0]['url'].startswith('https://mmajunkie.usatoday.com/story/'))

class BingFallbackTests(unittest.TestCase):
 def test_bing_redirect_is_decoded_and_other_sources_dropped(self):
  raw=b'<rss><channel><item><title>Fight announcement</title><link>https://www.bing.com/news/apiclick.aspx?url=https%3A%2F%2Fmmajunkie.usatoday.com%2Fstory%2Fsports%2Fufc%2F2026%2F11%2F09%2Ffight%2F1234%2F</link><pubDate>Mon, 09 Nov 2026 04:10:00 GMT</pubDate></item><item><title>Unrelated</title><link>https://www.bing.com/news/apiclick.aspx?url=https%3A%2F%2Fexample.org%2Fstory%2Fa</link><pubDate>Mon, 09 Nov 2026 04:10:00 GMT</pubDate></item></channel></rss>'
  rows=m.mma_junkie_bing(raw,dt.datetime(2026,11,9,6,tzinfo=dt.timezone.utc))
  self.assertEqual(len(rows),1)
  self.assertEqual(rows[0]['url'],'https://mmajunkie.usatoday.com/story/sports/ufc/2026/11/09/fight/1234/')
  self.assertEqual(rows[0]['timeBasis'],'Bing News feed timestamp')

class EditorialRoutingTests(unittest.TestCase):
 def test_routine_results_routed_out_of_news(self):
  headlines=['Chris Billam-Smith vs Cheavon Clarke Scorecard','Denzel Bentley vs Shane Mosley Jr. Scorecard','Da’Mazion Vanhouter vs Ivan Balaz Scorecard','Zuffa Boxing 12 Results from London','Buatsi vs Hutchinson 2 Results and Scorecard','UFC Vegas 124 results: Tatiana Suarez grinds her way to decision win','UFC Vegas 124 live blog: Tatiana Suarez vs Virna Jandiroba','Canelo vs Mbilli Scorecard and Round-by-Round Updates']
  headlines += ['Main Card Results | UFC Fight Night: Cortes Acosta vs Walker','Prelim Results | UFC Fight Night: Cortes Acosta vs Walker','Official Weigh-In Results | Zuffa Boxing 12']
  self.assertTrue(all(m.is_routine_result(h) for h in headlines))
 def test_significant_fight_news_is_retained(self):
  headlines=['Heavyweight Hits Downed Opponent, Jumps Into Crowd Swinging','Maycee Barber vs. Carli Judice scratched from UFC 335 lineup','Video: José Souza scores brutal first-round knockout at UFC Vegas 124','Oliver McCall Finally Dropped at 61 After 77 Bouts, Ref Says No','Canelo Fight No-Show Sparks IBF Title Demand']
  self.assertFalse(any(m.is_routine_result(h) for h in headlines))


class SourceSummaryTests(unittest.TestCase):
 def test_three_points_extracted_from_actual_feed_description(self):
  fixture='<rss><channel><item><title>Contender announcement</title><link>https://www.mmafighting.com/verified/story</link><pubDate>Mon, 09 Nov 2026 04:10:00 GMT</pubDate><description>Officials have confirmed the main-event pairing for the upcoming card. Both athletes are scheduled to attend the pre-fight press conference on Thursday. The event promoter has also published the official venue information.</description></item></channel></rss>'
  rows=m.parse_feed(fixture.encode(),'MMA Fighting','mma',dt.datetime(2026,11,9,6,tzinfo=dt.timezone.utc))
  self.assertEqual(len(rows),1)
  a=m.enrich_summary(rows[0],{},dt.datetime(2026,11,9,6,tzinfo=dt.timezone.utc))
  self.assertEqual(len(a.get('summaryPoints',[])),3)
  self.assertTrue(a['summaryPoints'][0].startswith('Officials'))
  self.assertNotIn('_summaryText',a)
 def test_not_fabricating_when_source_has_insufficient_detail(self):
  self.assertEqual(m.verified_key_points('Official story published today.'),[])
  a={'url':'https://example.com/post','title':'Headline only','_summaryText':'A fighter won.'}
  out=m.enrich_summary(a,{},dt.datetime(2026,11,9,6,tzinfo=dt.timezone.utc))
  self.assertNotIn('summaryPoints',out)
 def test_truncated_syndication_fragments_are_rejected(self):
  self.assertEqual(m.verified_key_points('The promotion announced the bout and more details will follow […]'),[])
  self.assertEqual(m.verified_key_points('The replacement accepted the matchup on Nov.'),[])
 def test_existing_points_must_pass_quality_guard(self):
  self.assertTrue(m.valid_summary_points([
   'The promotion officially announced the bout for the upcoming pay-per-view event.',
   'Both fighters are expected to attend the scheduled media event later this week.',
   'The venue information was published by the promoter alongside the fight announcement.'
  ]))
  self.assertFalse(m.valid_summary_points([
   'Walker and WAC stepped in on eight days notice to save the main event on Nov.',
   'A valid sentence with enough words to pass all of the ordinary length checks.',
   'Another valid sentence with enough words to pass all of the ordinary length checks.'
  ]))
 def test_repeated_fight_booking_points_are_not_treated_as_three_facts(self):
  bullets=[
   'UFC 335 has added a prospect vs. prospect battle between Demian Pinas and Baisangur Susurkayev.',
   'UFC 335 has added a big fight between two of the promotion’s best up and comers',
   'The UFC is matching up two of the division’s best prospects in a grudge match that has been building throughout the year.'
  ]
  self.assertEqual(len(m.distinct_summary_points(bullets)),1)
  self.assertFalse(m.valid_summary_points(bullets))
 def test_rephrased_division_opinion_is_not_three_facts(self):
  bullets=[
   'Ciryl Gane believes heavyweights have never been better.',
   'Ciryl Gane touts the heavyweight division as the best it’s ever been',
   'Ciryl Gane thinks reports of the heavyweight division’s demise are greatly exaggerated.'
  ]
  self.assertEqual(len(m.distinct_summary_points(bullets)),1)
 def test_separate_facts_about_one_story_are_allowed(self):
  bullets=[
   'The promotion confirmed the main event pairing at the weekend press briefing.',
   'Both fighters will attend the scheduled media conference in London this Thursday.',
   'Tickets go on sale to the public next week at the event venue.'
  ]
  self.assertEqual(len(m.distinct_summary_points(bullets)),3)
 def test_partial_original_reporting_is_better_than_fabricated_third_point(self):
  raw='UFC 335 has added a prospect bout between two of the division’s rising contenders. The UFC added a big fight between two highly rated prospects.'
  a={'url':'https://example.com/post','title':'New pairing','_summaryText':raw}
  out=m.enrich_summary(a,{},dt.datetime(2026,11,9,6,tzinfo=dt.timezone.utc))
  self.assertEqual(len(out.get('summaryPoints',[])),1)
  self.assertEqual(out['summaryQualityVersion'],m.SUMMARY_QUALITY_VERSION)
 def test_repeated_financial_claims_are_not_separate_bullets(self):
  points=[
   "Dmitriy Salita alleges Jake Paul's MVP demanded a $25k penalty for Claressa Shields' comments as the Chantelle Cameron fight stalled.",
   "Claressa Shields' promoter Dmitriy Salita accused Jake Paul's promotion of demanding a $25,000 penalty whenever the champion criticized MVP.",
   "Negotiations over the proposed Claressa Shields vs Chantelle Cameron fight have stalled, with both sides blaming the other."
  ]
  self.assertEqual(len(m.distinct_summary_points(points)),2)
 def test_snippet_fragments_and_publisher_filler_are_rejected(self):
  self.assertFalse(m.point_is_usable("Gabriel Bonfim, and the Brazilian now volunteers to serve as the backup fighter for Ciryl Gane vs."))
  self.assertFalse(m.point_is_usable("Vestnik MMA was first to report the booking."))
  self.assertFalse(m.point_is_usable("In an interview with UFC, Ciryl Gane addressed the chaos."))
 def test_non_combat_syndicated_news_is_not_included(self):
  self.assertTrue(m.is_non_combat_url("https://mmajunkie.usatoday.com/story/sports/nfl/lions/2026/11/08/story/123/"))
  self.assertFalse(m.is_non_combat_url("https://mmajunkie.usatoday.com/story/sports/ufc/2026/11/09/story/123/"))
 def test_retains_distinct_old_source_facts_when_publisher_unavailable(self):
  old={'title':'Verified fight contract dispute','summaryPoints':[
   'The promoter alleges that the group demanded a financial penalty during negotiations.',
   'The promoter accused the other group of demanding the same penalty again during talks.',
   'The two parties have not agreed on the proposed contest after the dispute became public.'
  ]}
  article={'url':'https://example.com/unchanged','title':old['title'],'_summaryText':''}
  out=m.enrich_summary(article,old,dt.datetime(2026,11,9,6,tzinfo=dt.timezone.utc),force=True)
  self.assertGreaterEqual(len(out.get('summaryPoints',[])),1)
  self.assertLessEqual(len(out['summaryPoints']),3)
 def test_content_encoded_is_used_for_summary_text(self):
  xml=b'<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item><title>Fight announced</title><link>https://example.com/fight</link><pubDate>Mon, 09 Nov 2026 04:10:00 GMT</pubDate><content:encoded><![CDATA[Officials confirmed the bout for the event next month. Both fighters accepted the matchup after negotiations concluded this week. The promoter also confirmed the venue and broadcast plans.]]></content:encoded></item></channel></rss>'
  row=m.parse_feed(xml,'Test','boxing',dt.datetime(2026,11,9,6,tzinfo=dt.timezone.utc))[0]
  self.assertIn('Both fighters accepted',row['_summaryText'])
 def test_publisher_meta_and_body(self):
  p=m.ArticleText()
  p.feed('<html><head><meta name="description" content="The reported contest will be held at the Sydney venue later this month."></head><body><article><p>The promotion released the event listing following the official announcement earlier today.</p><p>Tickets are expected to go on general sale through the venue next week.</p></article></body></html>')
  self.assertEqual(len(m.verified_key_points(*p.meta,*p.paragraphs)),3)

class ImageTests(unittest.TestCase):
 def test_feed_image_and_credit(self):
  item=m.ET.fromstring('<item><description>&lt;img src="https://www.worldboxingnews.com/photo.jpg" alt="A vs B" /&gt;</description></item>')
  self.assertEqual(m.image_candidates(item)[0]['alt'],'A vs B')
 def test_unsafe_images_rejected(self):
  p=m.ArticleImages();p.feed('<img src="javascript:alert(1)"><img src="http://example.com/a.jpg"><img width="1" src="https://example.com/pixel.png">')
  self.assertEqual(p.images,[])
 def test_atom_copyright(self):
  p=m.ArticleImages();p.feed('<img src="https://platform.mmafighting.com/a.jpg?width=800&amp;quality=80" data-portal-copyright="Getty Images">')
  self.assertEqual(p.images[0]['credit'],'Getty Images');self.assertIn('&quality',p.images[0]['url'])
