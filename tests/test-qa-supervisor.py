"""Run directly; separate optional PyYAML dependency from collector unittest discovery."""
import importlib.util
import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
spec=importlib.util.spec_from_file_location('qa',Path(__file__).resolve().parents[1]/'scripts/qa-supervisor.py')
qa=importlib.util.module_from_spec(spec);spec.loader.exec_module(qa)

class SupervisorTests(unittest.TestCase):
    def test_yaml_on_and_discovery_mapping(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'.github/workflows').mkdir(parents=True);(root/'tests').mkdir()
            for f in ['test_one.py','test_two.py','test-js.mjs']: (root/'tests'/f).touch()
            (root/'.github/workflows/check.yml').write_text('name: Check\non:\n  pull_request:\njobs:\n  unit:\n    steps:\n      - run: python -m unittest discover -s tests -p "test_one.py"\n')
            inv=qa.inventory(root)
            self.assertIn('pull_request',inv['workflows'][0]['triggers'])
            self.assertEqual(inv['workflows'][0]['tests'],['tests/test_one.py'])
    def test_failures_grouped_by_branch_and_recovery(self):
        def run(branch,result,day): return dict(path='ci.yml',head_branch=branch,event='push',status='completed',conclusion=result,created_at=day,html_url='https://example.com')
        rows=qa.workflow_health([run('main','success','3'),run('main','failure','2'),run('dev','failure','3')])
        self.assertEqual({r['branch']:r['consecutiveFailuresInSample'] for r in rows},{'main':0,'dev':1})
    def test_empty_and_invalid_ids_are_not_healthy(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'data').mkdir()
            for rows in [[], [{'id':''}], [{'id':'   '}], [{'id':[]}], [None], [{'id':True}]]:
                (root/'data/news-live.json').write_text(json.dumps(dict(articles=rows)))
                checks=qa.feed_checks(root,dt.datetime(2026,11,14,tzinfo=dt.timezone.utc))
                ids=next(c for c in checks if c['check']=='news-live.json:ids')
                self.assertEqual(ids['status'],'warning',repr(rows))
            (root/'data/news-live.json').write_text(json.dumps(dict(articles=[{'id':'valid'}, {'id':42}])))
            checks=qa.feed_checks(root,dt.datetime(2026,11,14,tzinfo=dt.timezone.utc))
            self.assertEqual(next(c for c in checks if c['check']=='news-live.json:ids')['status'],'pass')

    def test_missing_invalid_future_and_duplicate_data(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'data').mkdir()
            (root/'data/news-live.json').write_text(json.dumps(dict(articles=[{'id':'a'},{'id':'a'}],lastSuccessfulAt='2030-01-01T00:00:00Z')))
            (root/'data/upcoming-cards.json').write_text(json.dumps(dict(events=[],lastSuccessfulAt='2026-11-14')))
            checks=qa.feed_checks(root,dt.datetime(2026,11,14,tzinfo=dt.timezone.utc))
            status={c['check']:c['status'] for c in checks}
            self.assertEqual(status['news-live.json:ids'],'warning')
            self.assertEqual(status['news-live.json:freshness'],'warning')
            self.assertEqual(status['upcoming-cards.json:freshness'],'unknown')
            self.assertEqual(status['results.json'],'error')

if __name__=='__main__':unittest.main()
