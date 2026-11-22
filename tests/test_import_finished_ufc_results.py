import copy, datetime as dt, importlib.util, json, unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('importer', Path(__file__).resolve().parents[1] / 'scripts/import-finished-ufc-results.py')
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)

EVENTS = """EVENT,URL,DATE,LOCATION
UFC 334: Gane vs. Hokit,http://ufcstats.com/event-details/abc,"November 14, 2026","New York City, New York, USA"
"""
RESULTS = """EVENT,BOUT,OUTCOME,WEIGHTCLASS,METHOD,ROUND,TIME,TIME FORMAT,REFEREE,DETAILS,URL
UFC 334: Gane vs. Hokit,Josh Hokit vs. Ciryl Gane,W/L,UFC Heavyweight Title Bout,KO/TKO ,2,3:12,5 Rnd (5-5-5-5-5),Herb Dean,Punches to Head At DistanceWheel Kick,http://ufcstats.com/fight-details/1111111111111111
UFC 334: Gane vs. Hokit,Kayla Harrison vs. Amanda Nunes,W/L,Women's Bantamweight Bout,Decision - Unanimous,3,5:00,3 Rnd (5-5-5),Marc Goddard,Sal D'amato 29 - 28. Chris Lee 29 - 28. ,http://ufcstats.com/fight-details/2222222222222222
UFC 334: Gane vs. Hokit,José Souza vs. Dan Smith,D/D,Lightweight Bout,Decision - Split,3,5:00,3 Rnd (5-5-5),Herb Dean,,http://ufcstats.com/fight-details/3333333333333333
"""


def fetch(name):
    return {'ufc_event_details': EVENTS, 'ufc_fight_results': RESULTS}[name]


def upcoming(bouts):
    return {'events': [{'id': 'ufc-334-2026-11-14', 'date': '2026-11-14', 'promotion': 'UFC', 'title': 'UFC 334: Gane vs Hokit',
                        'location': 'Madison Square Garden, New York, USA', 'bouts': bouts}]}


BOUTS = [
    {'id': 'a', 'section': 'main', 'fighters': ['Ciryl Gane', 'Josh Hokit'], 'division': 'Heavyweight', 'records': ['14-2', '10-0'], 'recordSources': ['s1', 's2']},
    {'id': 'b', 'section': 'main', 'fighters': ['Amanda Nunes', 'Kayla Harrison'], 'division': "Women's Bantamweight"},
    {'id': 'c', 'section': 'prelims', 'fighters': ['Jose Souza', 'Dan Smith'], 'division': 'Lightweight'},
]
TODAY = dt.date(2026, 11, 19)

# The UFCStats export is refreshed weekly, so a card can be a day old before it
# appears. These fixtures stand in for the Wikipedia fallback that fills the gap:
# a season page whose event cells carry rowspans, and the event's own article.
SEASON = """=== Past events ===
{| class="sortable wikitable"
|-
|rowspan="2"|799
|rowspan="2"|[[UFC 334 (event)|UFC 334: Gane vs. Hokit]]
|rowspan="2"|{{dts|2026|Nov|14}}
|}
"""

ARTICLE = """{{Infobox MMA event
| date = {{start date|2026|11|14}}
| venue = [[Madison Square Garden]]
| city = [[New York City|New York]], USA
}}

== Results ==
{{MMAevent card|Main card}}
{{MMAevent bout
|Heavyweight
|[[Josh Hokit]]
|def.
|[[Ciryl Gane]] (c)
|KO (punches)
|2
|3:12
|
}}
{{MMAevent bout
|Women's Bantamweight
|[[Kayla Harrison]]
|def.
|[[Amanda Nunes]]
|Decision (unanimous) (29\u201328, 29\u201328, 29\u201328)
|3
|5:00
|
}}
{{MMAevent card|Preliminary card|header=no}}
{{MMAevent bout
|Lightweight
|[[Jose Souza]]
|vs.
|[[Dan Smith]]
|Draw (split)
|3
|5:00
|
}}
"""


def wiki_fetch(url):
    page = '2026 in UFC' if '2026%20in%20UFC' in url or '2026+in+UFC' in url else 'UFC 334: Gane vs. Hokit'
    text = SEASON if page == '2026 in UFC' else ARTICLE
    return json.dumps({'parse': {'title': page, 'wikitext': {'*': text}}})


def empty_csv(name):
    return {'ufc_event_details': 'EVENT,URL,DATE,LOCATION\n', 'ufc_fight_results':
            'EVENT,BOUT,OUTCOME,WEIGHTCLASS,METHOD,ROUND,TIME,TIME FORMAT,REFEREE,DETAILS,URL\n'}[name]




class ImporterTest(unittest.TestCase):
    def test_imports_a_finished_card_with_corners_mapped(self):
        cards = upcoming(BOUTS)
        results, report = importer.run({'events': [], 'results': []}, cards, fetch, TODAY)
        self.assertEqual(report, ['imported: UFC 334: Gane vs Hokit (3 bouts)',
                                  'retired: UFC 334: Gane vs Hokit (its result is published, so it leaves Upcoming)'])
        self.assertEqual(cards['events'], [], 'a finished card does not stay in Upcoming')
        event, rows = results['events'][0], results['results']
        self.assertEqual(event['mainBoutId'], rows[0]['id'])
        self.assertFalse(event['partialCoverage'])
        main = rows[0]
        self.assertEqual([f['name'] for f in main['fighters']], ['Ciryl Gane', 'Josh Hokit'])
        self.assertEqual(main['winner'], 1)  # Hokit won although listed second here
        self.assertEqual(main['method'], 'KO/TKO (punches to head at distance)')
        self.assertEqual((main['round'], main['time'], main['scheduledRounds']), (2, '3:12', 5))
        self.assertEqual(main['fighters'][0]['record'], '14–3–0')
        self.assertEqual(main['fighters'][1]['record'], '11–0–0')
        self.assertTrue(main['source'].startswith('https://ufcstats.com/fight-details/'))
        self.assertEqual(rows[1]['method'], 'unanimous decision')
        self.assertEqual(rows[1]['winner'], 1)
        self.assertEqual((rows[2]['winner'], rows[2]['method']), (None, 'split draw'))
        self.assertEqual(rows[2]['section'], 'Prelims')
        self.assertIn('Josh Hokit defeated Ciryl Gane', event['takeaways'][0]['text'])

    def test_waits_when_headline_bout_is_missing(self):
        bouts = [{'id': 'x', 'section': 'main', 'fighters': ['Someone Else', 'Another Name']}] + BOUTS
        results, report = importer.run({'events': [], 'results': []}, upcoming(bouts), fetch, TODAY)
        self.assertEqual(results['events'], [])
        self.assertIn('headline bout not in source yet', report[0])

    def test_waits_when_too_few_bouts_match(self):
        bouts = BOUTS[:1] + [{'id': f'z{i}', 'section': 'prelims', 'fighters': [f'Nobody {i}', f'Noone {i}']} for i in range(3)]
        results, report = importer.run({'events': [], 'results': []}, upcoming(bouts), fetch, TODAY)
        self.assertEqual(results['events'], [])
        self.assertIn('only 1 of 4', report[0])

    def test_never_touches_cards_already_in_results_but_does_clear_them_from_upcoming(self):
        existing = {'events': [{'id': 'ufc-334-2026-11-14', 'name': 'UFC 334: Gane vs Hokit', 'date': '2026-11-14'}], 'results': []}
        before = copy.deepcopy(existing)
        cards = upcoming(BOUTS)
        results, report = importer.run(existing, cards, fetch, TODAY)
        self.assertEqual(results, before, 'a published result is never rewritten')
        self.assertEqual(report, ['retired: UFC 334: Gane vs Hokit (its result is published, so it leaves Upcoming)'])
        self.assertEqual(cards['events'], [], 'the card left Upcoming even though nothing was imported')

    def test_other_promotions_are_left_in_upcoming(self):
        existing = {'events': [{'id': 'pfl-2026-11-14', 'name': 'PFL 11', 'date': '2026-11-14'}], 'results': []}
        cards = {'events': [{'id': 'pfl-2026-11-14', 'date': '2026-11-14', 'promotion': 'PFL', 'title': 'PFL 11', 'bouts': []}]}
        _, report = importer.run(existing, cards, fetch, TODAY)
        self.assertEqual(report, [], 'the UFC importer does not tidy another promotion')
        self.assertEqual(len(cards['events']), 1)

    def test_a_card_whose_result_is_filed_under_another_id_still_leaves(self):
        existing = {'events': [{'id': 'different-id', 'name': 'UFC 334: Gane vs Hokit', 'date': '2026-11-14'}], 'results': []}
        cards = upcoming(BOUTS)
        _, report = importer.run(existing, cards, fetch, TODAY)
        self.assertIn('retired: UFC 334: Gane vs Hokit', report[0], 'matched on date and name')
        self.assertEqual(cards['events'], [])

    def test_ignores_cards_from_other_promotions_and_too_old_or_future(self):
        card = upcoming(BOUTS)
        card['events'][0]['promotion'] = 'PFL'
        self.assertEqual(importer.run({'events': [], 'results': []}, card, fetch, TODAY)[1], [])
        self.assertEqual(importer.run({'events': [], 'results': []}, upcoming(BOUTS), fetch, dt.date(2026, 11, 14))[1], [])
        self.assertEqual(importer.run({'events': [], 'results': []}, upcoming(BOUTS), fetch, dt.date(2026, 12, 20))[1], [])

    def test_partial_card_is_labelled(self):
        bouts = BOUTS + [{'id': 'd', 'section': 'prelims', 'fighters': ['Not In Source', 'Also Missing']}]
        results, _ = importer.run({'events': [], 'results': []}, upcoming(bouts), fetch, TODAY)
        self.assertTrue(results['events'][0]['partialCoverage'])
        self.assertIn('3 of 4', results['events'][0]['archiveNote'])


class WikipediaFallbackTest(unittest.TestCase):
    """The site should not show a finished card as awaiting confirmation for a day."""

    def test_imports_from_wikipedia_when_the_export_has_not_caught_up(self):
        cards = upcoming(BOUTS)
        results, report = importer.run({'events': [], 'results': []}, cards, empty_csv, TODAY, wiki_fetch=wiki_fetch)
        self.assertEqual(report[0], 'provisional: UFC 334: Gane vs Hokit (3 bouts from Wikipedia)')
        self.assertEqual(cards['events'], [], 'a provisional import still finishes the card')
        event, rows = results['events'][0], results['results']
        self.assertTrue(event['provisional'])
        self.assertEqual(event['sourceVerified'], 'Wikipedia (CC BY-SA)')
        self.assertTrue(all(row['provisional'] for row in rows))
        main = rows[0]
        self.assertEqual([f['name'] for f in main['fighters']], ['Ciryl Gane', 'Josh Hokit'])
        self.assertEqual((main['winner'], main['method'], main['round'], main['time']), (1, 'KO (punches)', 2, '3:12'))
        self.assertEqual(main['fighters'][0]['record'], '14\u20133\u20130')
        self.assertTrue(main['source'].startswith('https://en.wikipedia.org/wiki/'))
        self.assertEqual((rows[2]['winner'], rows[2]['method']), (None, 'split draw'))

    def test_waits_when_wikipedia_is_missing_the_headline_bout(self):
        bouts = [{'id': 'x', 'section': 'main', 'fighters': ['Someone Else', 'Another Name']}] + BOUTS
        results, report = importer.run({'events': [], 'results': []}, upcoming(bouts), empty_csv, TODAY,
                                       wiki_fetch=wiki_fetch)
        self.assertEqual(results['events'], [])
        self.assertIn('not on Wikipedia yet', report[0])

    def test_without_a_wikipedia_fetcher_nothing_changes(self):
        results, report = importer.run({'events': [], 'results': []}, upcoming(BOUTS), empty_csv, TODAY)
        self.assertEqual(results['events'], [])
        self.assertIn('headline bout not in source yet', report[0])

    def test_a_source_that_is_down_leaves_the_card_waiting(self):
        def broken(url):
            raise OSError('wikipedia unreachable')
        results, report = importer.run({'events': [], 'results': []}, upcoming(BOUTS), empty_csv, TODAY,
                                       wiki_fetch=broken)
        self.assertEqual(results['events'], [])
        self.assertIn('Wikipedia unavailable', report[0])

    def test_the_export_replaces_the_provisional_card_once_and_keeps_added_work(self):
        results, _ = importer.run({'events': [], 'results': []}, upcoming(BOUTS), empty_csv, TODAY,
                                  wiki_fetch=wiki_fetch)
        results['results'][0]['highlights'] = 'https://example.test/finish'
        results['results'][0]['summary'] = 'Written by hand after the import.'
        upgraded, report = importer.run(results, upcoming(BOUTS), fetch, TODAY, wiki_fetch=wiki_fetch)
        self.assertEqual(report[0], 'upgraded: UFC 334: Gane vs Hokit to the UFCStats export (3 bouts)')
        event = upgraded['events'][0]
        self.assertNotIn('provisional', event)
        self.assertEqual(event['sourceVerified'], importer.SOURCE_LABEL)
        rows = [r for r in upgraded['results'] if r['eventId'] == event['id']]
        self.assertEqual(len(rows), 3)
        self.assertTrue(all('provisional' not in row for row in rows))
        main = next(r for r in rows if r['order'] == 0)
        self.assertTrue(main['source'].startswith('https://ufcstats.com/fight-details/'))
        self.assertEqual(main['scheduledRounds'], 5)
        self.assertEqual(main['highlights'], 'https://example.test/finish')
        self.assertEqual(main['summary'], 'Written by hand after the import.')
        self.assertEqual(main['fighters'][0]['record'], '14\u20133\u20130')  # records survive the swap
        again, report = importer.run(upgraded, {'events': []}, fetch, TODAY, wiki_fetch=wiki_fetch)
        self.assertEqual(report, [])  # nothing is rewritten a second time


if __name__ == '__main__':
    unittest.main()
