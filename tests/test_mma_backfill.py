import datetime as dt
import importlib.util
import pathlib
import unittest

from bs4 import BeautifulSoup

MODULE = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'backfill-mma-2026.py'
SPEC = importlib.util.spec_from_file_location('mma_archive_backfill', MODULE)
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)

class ArchiveBackfillTests(unittest.TestCase):
    def setUp(self):
        self.event={'id':'pfl-test','name':'PFL test','date':'2026-10-16',
                    'status':'completed','source':'https://www.ufcalendar.com/events/pfl-2026-10-16',
                    'expectedBouts':2,'partialCoverage':True}
    def test_date_windows(self):
        self.assertEqual(m.date_in('Fri 15 May ONE Friday Fights 154'),dt.date(2026,5,15) if False else None)
        self.assertEqual(m.date_in('Fri 15 May 2026 ONE Friday Fights 154'),dt.date(2026,5,15))
        self.assertEqual(m.date_in('Sat, Oct 24, 2026'),dt.date(2026,10,24))
        self.assertFalse(m.within(dt.date(2026,5,9)))
        self.assertFalse(m.within(dt.date(2026,11,14)))
    def test_pfl_full_result_and_records(self):
        raw='''<h1>PFL Chicago: Carmouche vs Bishop 2</h1><h2>Main card</h2>
        <ol><li><span>Decision R5 · 5:00</span>
        <a href="/fighters/liz-carmouche">Liz Carmouche</a> 26-9-0
        <span>Women's Flyweight</span>
        <a href="/fighters/jena-bishop">WIN Jena Bishop</a> 12-3-0</li></ol>'''
        result=m.find_pfl_rows(raw,self.event,{})
        self.assertEqual(len(result),1)
        self.assertEqual(result[0]['winner'],1)
        self.assertEqual(result[0]['method'],'Decision')
        self.assertEqual(result[0]['round'],5)
        self.assertEqual(result[0]['fighters'][0]['name'],'Liz Carmouche')
        self.assertEqual(result[0]['fighters'][0]['record'],'26–9–0')
        self.assertEqual(result[0]['fighters'][0]['recordContext'],'event-listing')
    def test_one_includes_muay_thai_not_mislabeled_mma(self):
        raw='''<h1>ONE Friday Fights 176</h1><p>14 fights</p>
        <div>Main Event Atomweight Muay Thai</div>
        <a href="/fighters/fighter-alpha">★ Fighter Alpha 4-2 · THA</a>
        <span>VS</span>
        <a href="/fighters/fighter-beta">Fighter Beta 3-1 · THA</a>
        <span>Knockout · R2</span>'''
        event,rows=m.parse_one(raw,'https://fighterarena.com/events/test',dt.date(2026,10,30),{})
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['sport'],'Muay Thai')
        self.assertEqual(rows[0]['winner'],0)
        self.assertEqual(rows[0]['method'],'knockout' if False else 'Knockout')
    def test_one_published_winner_without_method_is_kept(self):
        raw='''<h1>ONE Fight Night 48</h1><p>1 fights</p>
        <div>Heavyweight MMA</div>
        <a href="/fighters/shamil-erdogan">★ Shamil Erdogan 6-0</a>
        <span>VS</span>
        <a href="/fighters/paul-elliott">Paul Elliott 2-3</a>'''
        event,rows=m.parse_one(raw,'https://fighterarena.com/events/one-example',
                               dt.date(2026,10,3),{})
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['winner'],0)
        self.assertEqual(rows[0]['status'],'completed')
        self.assertEqual(rows[0]['method'],'Method not published by event source')

    def test_ufc_explicit_winner_only(self):
        raw='''<h1>UFC 333: Volkanovski vs Evloev Results, Winners, Methods & Fight Stats</h1>
        <div>Main Card · Featherweight title bout · 5 scheduled rounds</div>
        <h3>Alexander Volkanovski vs. Movsar Evloev</h3>
        <p>Winner Alexander Volkanovski</p><p>Method TKO</p>
        <p>Round / time R2 · 4:54</p><h4>Full fight stats</h4>'''
        event,rows=m.parse_ufc(raw,'https://www.ufcschedule.net/events/ufc-333-abu-dhabi',dt.date(2026,10,24),{})
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['winner'],0)
        self.assertEqual(rows[0]['round'],2)
        self.assertEqual(rows[0]['time'],'4:54')
    def test_merge_keeps_curated_winner_and_avoids_duplicates(self):
        source=self.event['source']
        old=m.result_row(self.event,'A Alpha','B Beta',None,None,0,'TKO',2,'1:22','Lightweight',
                         'Main card',0,source,{})
        new=m.result_row(self.event,'A Alpha','B Beta','4-1-0','2-2-0',1,'Decision',3,'5:00','Lightweight',
                         'Main card',0,source,{})
        data={'events':[self.event.copy()],'results':[old.copy()]}
        changes={'events':0,'bouts':0}
        m.merge(data,self.event,[new],changes)
        self.assertEqual(changes['bouts'],0)
        self.assertEqual(data['results'][0]['winner'],0)
        self.assertEqual(len(data['results']),1)

if __name__ == '__main__':
    unittest.main()
