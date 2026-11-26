#!/usr/bin/env python3
"""Does exempting title holders from Form's age penalty help or hurt? (owner, 26 Nov 2026: "Gane under 80 and Volk at 85 as defending champs?")

Research only. Runs scripts/ufc-form-backtest.py with CHAMP_AGE_FLOOR at several values (0 = today's rule; 1 = a title
holder's age part is full). Also prints the Form of the current champions at each value.
  python3 scripts/ufc-form-champion-age.py
"""
import subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
for floor in (0.0, 0.5, 1.0):
    for a, b in (("2022-01-01", "9999-12-31"), ("2018-01-01", "2021-12-31")):
        code = ("import importlib.util,sys;sys.argv=['x','--start','%s','--end','%s'];sys.path.insert(0,'scripts');"
                "s=importlib.util.spec_from_file_location('bt','scripts/ufc-form-backtest.py');bt=importlib.util.module_from_spec(s);s.loader.exec_module(bt);"
                "fb=bt.load_form();fb.CHAMP_AGE_FLOOR=%s;bt.load_form=lambda:fb;bt.main()") % (a, b, floor)
        out = subprocess.run([sys.executable, "-c", code], cwd=ROOT, capture_output=True, text=True).stdout.splitlines()
        print(f"floor {floor:<4} {a[:4]}+ ", [l for l in out if l.startswith("Form points")][0])
