import copy, datetime as dt, importlib.util, json, os, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('importer', HERE.parent / 'scripts/import-finished-results.py')
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)

ESPN = json.loads((HERE / 'fixtures/espn-pfl-dubai-2026-11-14.json').read_text())
CW = (HERE / 'fixtures/wiki-cage-warriors-213.txt').read_text()
ONE = (HERE / 'fixtures/wiki-one-friday-fights-178.txt').read_text()
PFL_SEASON = (HERE / 'fixtures/wiki-pfl-season-2026.txt').read_text()
PFL_ARTICLE = (HERE / 'fixtures/wiki-pfl-dubai-2026-11-14.txt').read_text()
TODAY = dt.date(2026, 11, 19)


def wiki(text):
    return json.dumps({'parse': {'wikitext': {'*': text}}})


def fetch(url, article=PFL_ARTICLE):
    if 'Professional%20Fighters%20League' in url:
        return wiki(PFL_SEASON)
    if 'PFL%20Dubai' in url:
        return wiki(article)
    if 'PFL%20' in url:
        return wiki('no results yet')
    if 'Cage' in url:
        return json.dumps({'parse': {'wikitext': {'*': 'intro\n' + CW}}})
    if 'ONE' in url:
        return json.dumps({'parse': {'wikitext': {'*': 'intro\n' + ONE}}})
    raise ValueError(url)


def card(promotion, cid, title, date, bouts):
    return {'id': cid, 'promotion': promotion, 'title': title, 'date': date, 'location': 'Somewhere', 'bouts': bouts}


PFL = card('PFL', 'pfl-dubai-2026-11-14', 'PFL Dubai: Nemkov vs Bilostenniy', '2026-11-14', [
    {'fighters': ['Vadim Nemkov', 'Sergei Bilostenniy'], 'division': 'Heavyweight', 'records': ['19-3', '13-2'], 'recordSources': ['s1', 's2']},
    {'fighters': ['Patrick Habirora', 'Omar El Dafrawy']},
    {'fighters': ['Cancelled Fighter', 'Other Person']}])
CAGE = card('Cage Warriors', 'cage-warriors-213-2026-11-14', 'CW 213 London: Bagley vs Souza', '2026-11-14', [
    {'fighters': ['Nik Bagley', 'Bruno Souza'], 'records': ['10-1', '12-4']}, {'fighters': ['Jawany Scott', 'Willians Nogueira']}])
ONEC = card('ONE Championship', 'one-friday-fights-178-2026-11-13', 'ONE Friday Fights 178 & The Inner Circle 38', '2026-11-13', [
    {'fighters': ['Nattakorn Kesorn', 'Mathew Gesto']}, {'fighters': ['Suhyeon Kim', 'Takumi Fukamachi']}])


def run(*cards, fetcher=fetch, today=TODAY, results=None):
    return importer.run(results or {'events': [], 'results': []}, {'events': list(cards)}, fetcher, today)


class ImportFinishedResultsTest(unittest.TestCase):
    def test_pfl_from_wikipedia_article_with_spelling_differences(self):
        results, report = run(PFL)
        self.assertEqual(report[:1], ['imported: PFL Dubai: Nemkov vs Bilostenniy (5 bouts from Wikipedia (CC BY-SA))'])
        rows = results['results']
        main = rows[0]
        # Wikipedia spells him "Sergey"; BEFN's spelling and corner order are kept.
        self.assertEqual([f['name'] for f in main['fighters']], ['Vadim Nemkov', 'Sergei Bilostenniy'])
        self.assertEqual(main['winner'], 1)
        self.assertEqual((main['method'], main['round'], main['time']), ('unanimous decision', 5, '5:00'))
        self.assertEqual(main['fighters'][0]['record'], '19–4–0')
        self.assertEqual(main['fighters'][1]['record'], '14–2–0')
        self.assertEqual(rows[1]['method'], 'Technical Submission (guillotine choke)')
        self.assertEqual([r['section'] for r in rows], ['Main card'] * 3 + ['Prelims'] * 2)
        self.assertEqual(results['events'][0]['source'], 'https://en.wikipedia.org/wiki/PFL_Dubai%3A_Nemkov_vs._Bilostenniy')

    def test_pfl_waits_until_article_has_results(self):
        results, report = run(PFL, fetcher=lambda u: fetch(u, PFL_ARTICLE.split('==Results==')[0]))
        self.assertEqual(results['events'], [])
        self.assertEqual(report, ['waiting: PFL Dubai: Nemkov vs Bilostenniy (not at source yet)'])

    def test_espn_parser_kept_for_reference(self):
        event = importer.parse_espn_event(ESPN, 'pfl')
        self.assertEqual(len(event['bouts']), 13)
        main = event['bouts'][0]
        self.assertEqual((main['fighters'], main['winner'], main['method']), (['Vadim Nemkov', 'Sergei Bilostenniy'], 1, 'unanimous decision'))

    def test_cage_warriors_template_layout_with_no_contest(self):
        results, report = run(CAGE)
        self.assertIn('imported: CW 213 London: Bagley vs Souza (9 bouts', report[0])
        rows = results['results']
        self.assertEqual((rows[0]['winner'], rows[0]['method']), (None, 'no contest (accidental groin kick)'))
        self.assertEqual(rows[0]['fighters'][0]['record'], '10–1–0')  # no contest changes nothing
        self.assertEqual(rows[1]['method'], 'unanimous decision')
        self.assertEqual(rows[2]['division'], 'Catchweight (161 lb)')
        self.assertEqual(rows[-1]['section'], 'Prelims')
        self.assertEqual(results['events'][0]['sourceVerified'], 'Wikipedia (CC BY-SA)')

    def test_one_table_layout_sessions_sport_and_reordered_names(self):
        results, report = run(ONEC)
        self.assertIn('imported: ONE Friday Fights 178 & The Inner Circle 38 (6 bouts', report[0])
        rows = results['results']
        self.assertEqual(rows[0]['fighters'][0]['name'], 'Anar Mammadov')  # source headliner leads
        self.assertEqual((rows[0]['sport'], rows[0]['division'], rows[0]['session']), ('Muay Thai', 'Bantamweight', 'ONE Friday Fights'))
        kim = next(r for r in rows if 'Fukamachi' in r['fighters'][1]['name'])
        self.assertEqual(kim['fighters'][0]['name'], 'Suhyeon Kim')  # BEFN spelling kept
        self.assertEqual(kim['sport'], 'MMA')
        inner = [r for r in rows if r['section'] == 'The Inner Circle']
        self.assertEqual(len(inner), 2)
        self.assertEqual(inner[1]['fighters'][0]['name'], 'PTT Apichartfarm')

    def test_waits_when_event_not_at_source(self):
        early = card('ONE Championship', 'one-x', 'ONE Unknown', '2026-11-13', [{'fighters': ['Nobody Here', 'Someone Else']}])
        results, report = run(early)
        self.assertEqual(results['events'], [])
        self.assertEqual(report, ['waiting: ONE Unknown (not at source yet)'])

    def test_skips_known_cards_other_promotions_and_age_window(self):
        known = {'events': [{'id': PFL['id']}], 'results': []}
        self.assertEqual(run(PFL, results=known)[1], [])
        self.assertEqual(run(dict(PFL, promotion='UFC'))[1], [])
        self.assertEqual(run(PFL, today=dt.date(2026, 11, 14))[1], [])
        self.assertEqual(run(PFL, today=dt.date(2026, 12, 20))[1], [])

    def test_name_key_ignores_order_hyphens_and_accents(self):
        self.assertEqual(importer.name_key('Kim Su-hyeon'), importer.name_key('Suhyeon Kim'))
        self.assertEqual(importer.name_key('Sado Uçar'), importer.name_key('Sado Ucar'))
        self.assertEqual(importer.name_key('Nik Bagley (c)'), importer.name_key('Nik Bagley'))
        self.assertTrue(importer.same_bout(('Vadim Nemkov', 'Sergei Bilostenniy'), ('Sergey Bilostenniy', 'Vadim Nemkov')))
        self.assertTrue(importer.same_bout(('Shem Rock', 'Connor Hughes'), ('Connor Hughes', 'Shaqueme Rock')))
        self.assertFalse(importer.same_bout(('Vadim Nemkov', 'Sergei Bilostenniy'), ('Vadim Nemkov', 'Fedor Emelianenko')))


if __name__ == '__main__':
    unittest.main()


# ---------- boxing via Boxerbook ----------
# Shaped like Boxerbook's /v1/results answer (field names checked against the live API on
# 2026-11-19); the bouts are real results from 7 Nov 2026, trimmed to two events.
BOXERBOOK = (HERE / 'fixtures/boxerbook-results-sample.json').read_text()
BOXING_TODAY = dt.date(2026, 11, 12)


def bb_fetch(url, headers=None):
    assert url.startswith('https://boxerbook.com/v1/results') and headers['Authorization'].startswith('Bearer ')
    return BOXERBOOK


BUATSI = {'id': 'buatsi-hutchinson-2026-11-07', 'sport': 'boxing', 'promotion': 'Queensberry',
          'title': 'Buatsi vs Hutchinson II', 'date': '2026-11-07', 'location': 'London', 'bouts': [
              {'fighters': ['Joshua Buatsi', 'Willy Hutchinson'], 'section': 'main', 'division': 'Light Heavyweight',
               'records': ['21-1 (13 KOs)', '20-2 (16 KOs)'], 'recordSources': ['q1', 'q2']},
              {'fighters': ['Jack Rafferty', 'Hovhannes Martirosyan'], 'section': 'main'},
              {'fighters': ['Tumi Philips', 'Angelo Dragone']}]}  # filed under no event at Boxerbook; one 'l' on BEFN


class Boxing(unittest.TestCase):
    def setUp(self):
        os.environ['BOXERBOOK_API_KEY'] = 'test-key'

    def tearDown(self):
        os.environ.pop('BOXERBOOK_API_KEY', None)

    def run_card(self, card=BUATSI, today=BOXING_TODAY):
        results = {'events': [], 'results': []}
        return importer.run(results, {'events': [copy.deepcopy(card)]}, bb_fetch, today)

    def test_imports_only_this_card_headliner_first_in_befn_corners(self):
        results, report = self.run_card()
        self.assertEqual(report[:1], ['imported: Buatsi vs Hutchinson II (5 bouts from Data from Boxerbook (https://boxerbook.com))'])
        rows = results['results']
        self.assertNotIn('Cheavon Clarke', json.dumps(rows))  # a different event on the same night
        main = rows[0]
        self.assertEqual([f['name'] for f in main['fighters']], ['Joshua Buatsi', 'Willy Hutchinson'])
        self.assertEqual((main['winner'], main['method'], main['round']), (1, 'unanimous decision', 12))
        self.assertEqual(main['source'], 'https://boxerbook.com/bouts/192140/x')
        self.assertEqual([r['section'] for r in rows], ['Main card', 'Main card', 'Undercard', 'Undercard', 'Undercard'])
        self.assertEqual([f['name'] for f in rows[2]['fighters']], ['Tumi Philips', 'Angelo Dragone'])  # BEFN spelling, third as announced
        self.assertEqual(results['events'][0]['sourceVerified'], 'Data from Boxerbook (https://boxerbook.com)')

    def test_records_ignore_ko_counts_and_fall_back_to_boxerbook(self):
        rows = self.run_card()[0]['results']
        buatsi, hutch = rows[0]['fighters']
        self.assertEqual((buatsi['preRecord'], buatsi['record']), ('21-1-0', '21–2–0'))
        self.assertEqual((hutch['preRecord'], hutch['record']), ('20-2-0', '21–2–0'))
        rafferty, marti = rows[1]['fighters']  # not given by BEFN: taken from Boxerbook, sides kept straight
        self.assertEqual((rafferty['preRecord'], rafferty['record'], rafferty['recordSource']),
                         ('28-0-1', '29–0–1', 'https://boxerbook.com/bouts/192141/x'))
        self.assertEqual(marti['record'], '20–2–0')

    def test_draw_and_stoppage(self):
        rows = {r['fighters'][0]['name']: r for r in self.run_card()[0]['results']}
        self.assertEqual((rows['Charlie Box']['winner'], rows['Charlie Box']['method']), (None, 'split draw'))
        self.assertEqual(rows['Charlie Box']['fighters'][0].get('preRecord'), None)
        rea = next(r for r in rows.values() if 'Bradley Rea' in json.dumps(r))
        self.assertEqual((rea['method'], rea['round'], rea['time'], rea['division']), ('TKO', 2, '0:58', 'Heavyweight'))

    def test_without_key_nothing_is_imported(self):
        os.environ.pop('BOXERBOOK_API_KEY')
        results, report = self.run_card()
        self.assertEqual(results['results'], [])
        self.assertTrue(report[0].startswith('error: Buatsi vs Hutchinson II'))

    def test_outside_boxerbook_window_is_left_alone(self):
        self.assertEqual(self.run_card(today=dt.date(2026, 11, 21))[1], [])

    def test_unrelated_card_waits(self):
        other = dict(BUATSI, id='x', title='Other', bouts=[{'fighters': ['Nobody One', 'Nobody Two']}])
        self.assertEqual(self.run_card(other)[1], ['waiting: Other (not at source yet)'])

    def test_close_spellings(self):
        self.assertTrue(importer.same_person('Albina Moldazhanova', 'Albina Maldozhanova'))
        self.assertFalse(importer.same_person('Albina Moldazhanova', 'Alina Petrova'))
        self.assertFalse(importer.same_person('Jose Garcia', 'Jose Garza'))

    def test_record_after_reads_only_the_record(self):
        self.assertEqual(importer.record_after('14-0 (8 KOs)', 'win'), ('14-0-0', '15–0–0'))
        self.assertEqual(importer.record_after('Record unavailable', 'win'), (None, None))
