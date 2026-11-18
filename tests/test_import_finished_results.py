import copy, datetime as dt, importlib.util, json, unittest
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
        self.assertEqual(report, ['imported: PFL Dubai: Nemkov vs Bilostenniy (5 bouts from Wikipedia (CC BY-SA))'])
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
