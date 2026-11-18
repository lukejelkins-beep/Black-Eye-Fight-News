import copy, datetime as dt, importlib.util, unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('importer', Path(__file__).resolve().parents[1] / 'scripts/import-finished-ufc-results.py')
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)

EVENTS = """EVENT,URL,DATE,LOCATION
UFC 334: Gane vs. Hokit,http://ufcstats.com/event-details/abc,"November 14, 2026","New York City, New York, USA"
"""
RESULTS = """EVENT,BOUT,OUTCOME,WEIGHTCLASS,METHOD,ROUND,TIME,TIME FORMAT,REFEREE,DETAILS,URL
UFC 334: Gane vs. Hokit,Josh Hokit vs. Ciryl Gane,W/L,UFC Heavyweight Title Bout,KO/TKO,2,3:12,5 Rnd (5-5-5-5-5),Herb Dean,Punches to Head At Distance,http://ufcstats.com/fight-details/1111111111111111
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


class ImporterTest(unittest.TestCase):
    def test_imports_a_finished_card_with_corners_mapped(self):
        results, report = importer.run({'events': [], 'results': []}, upcoming(BOUTS), fetch, TODAY)
        self.assertEqual(report, ['imported: UFC 334: Gane vs Hokit (3 bouts)'])
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
        self.assertEqual((rows[2]['winner'], rows[2]['method']), (None, 'draw'))
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

    def test_never_touches_cards_already_in_results(self):
        existing = {'events': [{'id': 'ufc-334-2026-11-14', 'name': 'UFC 334: Gane vs Hokit', 'date': '2026-11-14'}], 'results': []}
        before = copy.deepcopy(existing)
        results, report = importer.run(existing, upcoming(BOUTS), fetch, TODAY)
        self.assertEqual(results, before)
        self.assertEqual(report, [])

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


if __name__ == '__main__':
    unittest.main()
