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

class EditorialRoutingTests(unittest.TestCase):
 def test_routine_results_routed_out_of_news(self):
  headlines=['Chris Billam-Smith vs Cheavon Clarke Scorecard','Denzel Bentley vs Shane Mosley Jr. Scorecard','Da’Mazion Vanhouter vs Ivan Balaz Scorecard','Zuffa Boxing 12 Results from London','Buatsi vs Hutchinson 2 Results and Scorecard','UFC Vegas 124 results: Tatiana Suarez grinds her way to decision win','UFC Vegas 124 live blog: Tatiana Suarez vs Virna Jandiroba','Canelo vs Mbilli Scorecard and Round-by-Round Updates']
  self.assertTrue(all(m.is_routine_result(h) for h in headlines))
 def test_significant_fight_news_is_retained(self):
  headlines=['Heavyweight Hits Downed Opponent, Jumps Into Crowd Swinging','Maycee Barber vs. Carli Judice scratched from UFC 335 lineup','Video: José Souza scores brutal first-round knockout at UFC Vegas 124','Oliver McCall Finally Dropped at 61 After 77 Bouts, Ref Says No','Canelo Fight No-Show Sparks IBF Title Demand']
  self.assertFalse(any(m.is_routine_result(h) for h in headlines))

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
