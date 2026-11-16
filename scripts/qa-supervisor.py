#!/usr/bin/env python3
"""Read-only inventory and operational report. Never collects or certifies fights."""
import argparse
from collections import Counter
import datetime as dt
import fnmatch
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.request

UTC = dt.timezone.utc


def inventory(root):
    # BaseLoader preserves GitHub's `on` key (YAML 1.1 SafeLoader turns it into True).
    import yaml
    workflows = []
    tests = sorted(p.relative_to(root).as_posix() for p in (root / 'tests').glob('test*') if p.is_file())
    for path in sorted((root / '.github/workflows').glob('*.y*ml')):
        doc = yaml.load(path.read_text(), Loader=yaml.BaseLoader)
        jobs = doc.get('jobs', {})
        commands = '\n'.join(s.get('run', '') for j in jobs.values() for s in j.get('steps', []))
        covered = set(re.findall(r'tests/[\w.*?/-]+\.(?:py|mjs|cjs|js)', commands))
        matched = {t for t in tests if any(fnmatch.fnmatch(t, p) for p in covered)}
        for line in commands.splitlines():
            if 'unittest discover' in line and '-s tests' in line:
                pattern = re.search(r"-p\s+['\"]?([^'\"\s]+)", line)
                matched.update(t for t in tests if fnmatch.fnmatch(Path(t).name, pattern.group(1) if pattern else 'test*.py'))
        workflows.append(dict(path=path.relative_to(root).as_posix(), name=doc.get('name', path.stem),
            triggers=doc.get('on', {}), permissions=doc.get('permissions', 'inherited; not inspected'),
            concurrency=doc.get('concurrency'), tests=sorted(matched),
            scripts=sorted(set(re.findall(r'scripts/[\w./-]+\.(?:py|mjs|cjs|js)', commands))),
            jobs={name:dict(needs=j.get('needs', []), timeout=j.get('timeout-minutes'),
                permissions=j.get('permissions'), concurrency=j.get('concurrency'),
                actions=[s['uses'] for s in j.get('steps', []) if 'uses' in s]) for name,j in jobs.items()},
            owner='not declared' if not (root/'.github/CODEOWNERS').exists() else 'see .github/CODEOWNERS',
            cost='billing unavailable', necessity='retain pending owner/dependency review'))
    return dict(workflows=workflows, tests=[dict(path=t, workflows=[w['path'] for w in workflows if t in w['tests']],
        note='Static command mapping; indirect script invocation may add coverage.') for t in tests])


def feed_checks(root, now):
    checks = []
    # Thresholds are operational warnings, not editorial correctness or certification gates.
    for filename, collection, timestamp, hours in [
        ('news-live.json','articles','lastSuccessfulAt',2),
        ('upcoming-cards.json','events','lastSuccessfulAt',12),
        ('results.json','results','reviewedAt',48),
        ('fight-film.json','videos','updatedAt',2),
        ('fight-talk-live.json','posts','checkedAt',2)]:
        path = root/'data'/filename
        try:
            data = json.loads(path.read_text())
            rows = data.get(collection)
            if not isinstance(rows, list):
                raise ValueError(f'{collection} must be an array')
            ids = [r.get('id') if isinstance(r, dict) else None for r in rows]
            valid_ids = [i for i in ids if (isinstance(i, str) and i.strip()) or type(i) is int]
            counts = Counter(valid_ids)
            duplicate_ids = sorted(str(i) for i, count in counts.items() if count > 1)
            invalid_ids = len(ids) - len(valid_ids)
            checks.append(dict(check=f'{filename}:ids', status='warning' if not rows or duplicate_ids or invalid_ids else 'pass',
                               detail=dict(rows=len(rows), emptyFeed=not rows, duplicateIds=duplicate_ids,
                                           missingIds=ids.count(None), invalidIds=invalid_ids)))
            raw = data.get(timestamp)
            try:
                # Date-only values cannot establish sub-day freshness.
                if not isinstance(raw, str) or 'T' not in raw:
                    raise ValueError('missing precise timestamp')
                stamp = dt.datetime.fromisoformat(raw.replace('Z','+00:00'))
                if stamp.tzinfo is None:
                    raise ValueError('missing timezone')
                age = (now-stamp).total_seconds()/3600
                status = 'warning' if age > hours or age < -1 else 'pass'
                detail = dict(field=timestamp, value=raw, ageHours=round(age,2), warningAfterHours=hours)
            except (TypeError,ValueError):
                status, detail = 'unknown', dict(field=timestamp, value=raw, reason='No precise timezone-aware freshness timestamp')
            checks.append(dict(check=f'{filename}:freshness',status=status,detail=detail))
        except (OSError,ValueError,AttributeError) as exc:
            checks.append(dict(check=filename,status='error',detail=str(exc)))
    return checks


def workflow_health(runs):
    # Keep branch/event separate: old PR failures must not be reported as main outages.
    groups = {}
    for run in sorted(runs, key=lambda r:r.get('created_at',''), reverse=True):
        key = (run['path'],run['head_branch'],run['event'])
        groups.setdefault(key,[]).append(run)
    output = []
    for (path,branch,event), history in sorted(groups.items()):
        completed = [r for r in history if r.get('status')=='completed' and r.get('conclusion') not in ('cancelled','skipped','neutral')]
        streak = 0
        for run in completed:
            if run.get('conclusion') in ('failure','timed_out','action_required','startup_failure'): streak += 1
            else: break
        output.append(dict(path=path,branch=branch,event=event,latest=history[0].get('conclusion') or history[0]['status'],
                           consecutiveFailuresInSample=streak,url=history[0]['html_url'],sampleSize=len(history)))
    return output


def github_runs(repository):
    if not re.fullmatch(r'[\w.-]+/[\w.-]+', repository): raise ValueError('Invalid repository')
    headers = {'Accept':'application/vnd.github+json','User-Agent':'BEFN-readonly-QA'}
    if os.environ.get('GH_TOKEN'): headers['Authorization']='Bearer '+os.environ['GH_TOKEN']
    # One bounded request per report. No provider calls or requests per fighter.
    request = urllib.request.Request(f'https://api.github.com/repos/{repository}/actions/runs?branch=main&per_page=100', headers=headers)
    with urllib.request.urlopen(request, timeout=25) as response:
        return json.load(response)['workflow_runs']


def markdown(report):
    inv = report['inventory']
    lines = ['# BEFN QA status', '', f"Source: `{report['revision']}`; observed {report['observedAt']}", '',
        '**Scope:** configuration inventory and read-only diagnostics; not career certification, production UI signoff or branch-protection verification.', '',
        f"{len(inv['workflows'])} workflows; {len(inv['tests'])} test files. Billing and ownership require separate review.", '',
        '## Data diagnostics', '', '| Check | Status | Detail |','|---|---|---|']
    for c in report['dataChecks']:
        lines.append(f"| {c['check']} | {c['status']} | {str(c['detail']).replace('|','/')} |")
    lines += ['', '## Actions health', '', report['historyScope'], '']
    for w in report['workflowHealth']:
        lines.append(f"- [{w['path']}]({w['url']}), {w['branch']} / {w['event']}: {w['latest']}; consecutive failures observed: {w['consecutiveFailuresInSample']}.")
    lines += ['', '## Findings register', '', '| ID | Priority | Status | Finding |', '|---|---|---|---|']
    for f in report['findings']:
        lines.append(f"| {f['id']} | {f['severity']} | {f['status']} | {f['title']} |")
    lines += ['', '## Workflow inventory', '', '| Workflow | Triggers | Explicit tests | Scripts |', '|---|---|---|---|']
    for w in inv['workflows']:
        lines.append(f"| {w['path']} | {', '.join(w['triggers'])} | {len(w['tests'])} | {', '.join(w['scripts'])} |")
    lines += ['', 'Full trigger filters, schedules, permissions, dependencies, test mappings and limitations are in qa-status.json.', '']
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='qa/supervisor')
    parser.add_argument('--github', action='store_true', help='One read-only GitHub main-branch run-history request')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    now = dt.datetime.now(UTC)
    report = dict(observedAt=now.isoformat(),revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
        inventory=inventory(root),dataChecks=feed_checks(root,now),workflowHealth=[],
        historyScope='Not requested: workflow health is unknown.', findings=json.loads((root/'qa/findings.json').read_text()))
    if args.github:
        try:
            runs = github_runs(os.environ.get('GITHUB_REPOSITORY','lukejelkins-beep/Black-Eye-Fight-News'))
            report['workflowHealth']=workflow_health(runs)
            report['historyScope']=f'Latest {len(runs)} main-branch runs only. Workflows absent from this bounded sample are UNKNOWN, not healthy. Runtime/billing and PR readiness are not inferred.'
        except Exception as exc:
            # Do not print request headers, URLs containing credentials, or response bodies.
            report['historyScope']=f'GitHub history unavailable ({type(exc).__name__}); operational health UNKNOWN.'
    output = Path(args.output)
    output.mkdir(parents=True,exist_ok=True)
    (output/'qa-status.json').write_text(json.dumps(report,indent=2)+'\n')
    (output/'qa-status.md').write_text(markdown(report))
    print(f'QA report: {output}/qa-status.md')
    # Advisory data checks must not silently redefine release/certification gates.
    return 0

if __name__=='__main__':
    raise SystemExit(main())
