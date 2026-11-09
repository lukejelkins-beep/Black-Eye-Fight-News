import unittest
from importlib.machinery import SourceFileLoader
from pathlib import Path
m = SourceFileLoader('record_enrichment', str(Path(__file__).parents[1] / 'scripts/enrich-fighter-records.py')).load_module()

class FighterRecordTests(unittest.TestCase):
    def test_exact_bout_match_only(self):
        rows=[{'sport':'MMA','fighters':[{'name':'Cody Durden','record':None},{'name':'Ode’ Osbourne','record':None}]}]
        pair={'competitors':[{'athlete':{'id':'1','fullName':'Cody Durden'},'record':'18-7-1'},{'athlete':{'id':'2','fullName':'Ode’ Osbourne'},'record':'13-9-0'}]}
        self.assertEqual(m.apply_records(rows,pair,'2026-11-09'),2)
        self.assertEqual(rows[0]['fighters'][0]['record'],'18–7–1')
        self.assertEqual(m.apply_records(rows,pair,'2026-11-09'),0)
        self.assertIn('/id/1',rows[0]['fighters'][0]['recordSource'])
    def test_reject_unmatched_and_incomplete(self):
        rows=[{'sport':'MMA','fighters':[{'name':'A','record':None},{'name':'B','record':None}]}]
        fixture={'competitors':[{'athlete':{'fullName':'A'},'record':'12-2'},{'athlete':{'fullName':'C'},'record':'12-2-0'}]}
        self.assertEqual(m.apply_records(rows,fixture,'2026-11-09'),0)
        self.assertIsNone(m.record_of({'record':'12-2'}))
    def test_preserve_existing(self):
        rows=[{'sport':'MMA','fighters':[{'name':'A','record':'3–0–0'},{'name':'B','record':None}]}]
        fixture={'competitors':[{'athlete':{'fullName':'A'},'record':'9-0-0'},{'athlete':{'fullName':'B'},'record':'1-2-0'}]}
        self.assertEqual(m.apply_records(rows,fixture,'2026-11-09'),1)
        self.assertEqual(rows[0]['fighters'][0]['record'],'3–0–0')
if __name__=='__main__':unittest.main()
