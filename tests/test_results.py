import unittest, importlib.util, pathlib, datetime as dt
spec=importlib.util.spec_from_file_location('results',pathlib.Path(__file__).parents[1]/'scripts/refresh-results.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class ResultsTests(unittest.TestCase):
 def test_formats(self):
  for text in ['A defeated B by TKO (strikes) at 4:47 of Round 3','Main Event: A defeats B via TKO – Round 3, 4:47']:
   p=m.parse(text);self.assertEqual(p['round'],3);self.assertEqual(p['time'],'4:47')
  self.assertIsNone(m.parse('A vs B'))
 def test_idempotent_record_and_order(self):
  row={'fighters':[{'name':'B','preRecord':'2-0-0'},{'name':'A','preRecord':'3-1-0'}]};p=m.parse('A defeats B via unanimous decision (30-27, 30-27, 30-27)')
  for _ in range(3):self.assertTrue(m.apply_result(row,p,'https://source'))
  self.assertEqual(row['winner'],1);self.assertEqual(row['fighters'][0]['record'],'2–1–0');self.assertEqual(row['fighters'][1]['record'],'4–1–0')
 def test_boxing_result_and_highlight(self):
  rows=m.parse_fightmag('<li>A def. B by KO (R2, 0:58) | <a href="https://www.fightmag.com/highlights/">Watch video</a></li><li>C def. D</li>')
  self.assertEqual(rows[0]['round'],2);self.assertEqual(rows[0]['time'],'0:58');self.assertIn('highlights',rows[0]);self.assertIn('awaiting',rows[1]['method'])
 def test_source_failure_retains_results(self):
  data={'events':[{'id':'a','date':'2026-11-08','feeds':['bad'],'expectedBouts':1,'status':'completed'}],'results':[{'eventId':'a','status':'completed','fighters':[]}]}
  def fail(_):raise OSError()
  out=m.refresh(data,fail,dt.datetime(2026,11,8,tzinfo=dt.timezone.utc));self.assertEqual(out['results'],data['results']);self.assertTrue(out['events'][0]['feedDelayed'])
if __name__=='__main__':unittest.main()
