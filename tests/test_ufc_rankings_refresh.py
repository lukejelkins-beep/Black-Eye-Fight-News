"""Tests for scripts/refresh-ufc-rankings.py (no network: saved HTML only)."""
import datetime as dt
import importlib.util
import json
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("rankings", ROOT / "scripts/refresh-ufc-rankings.py")
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
divisions = r._divisions_module()
LABELS = {label: slug for slug, label in divisions.DIVISIONS.items()}
TODAY = dt.date(2026, 11, 22)


def division_html(label, champion, names, extra=""):
    rows = "".join(f"<tr><td>{rank}</td><td><a href='/athlete/x'>{name}</a>{extra}</td></tr>"
                   for rank, name in names)
    return (f"<table><caption><h4>{label}</h4><h5>{champion}</h5><span>Champion</span>"
            f"<a>{champion}</a></caption><tbody>{rows}</tbody></table>")


def ranked(prefix, n=15, tie=None):
    rows = [(i, f"{prefix} Fighter{i}") for i in range(1, n + 1)]
    if tie:
        rows = [(i, name) for i, name in rows if i != tie] + [(tie - 1, f"{prefix} Tied")]
    return sorted(rows)


def page(*sections, meta=""):
    return ("<html><script>var x='1 · Script Noise'</script><body>"
            "<h2>All Rankings</h2><div>Men's Pound-for-Pound Top Rank</div>"
            "<table><tbody><tr><td>1</td><td>Pfp Guy</td></tr></tbody></table>"
            + "".join(sections) + "<h2>All Meta Rankings</h2>" + meta + "</body></html>")


class ParseTests(unittest.TestCase):
    def test_reads_champion_and_ranks_and_ignores_meta_and_p4p_and_script(self):
        meta = division_html("Flyweight", "Wrong Champ", ranked("Meta"))
        got = r.parse_rankings(page(division_html("Flyweight", "Joshua Van", ranked("Fly")), meta=meta), LABELS)
        self.assertEqual(list(got), ["flyweight"])
        fly = got["flyweight"]
        self.assertEqual(fly["champion"], "Joshua Van")
        self.assertEqual(len(fly["ranked"]), 15)
        self.assertEqual(fly["ranked"][0], (1, "Fly Fighter1"))
        self.assertFalse(any("Meta" in n or "Pfp" in n or "Script" in n for _, n in fly["ranked"]))

    def test_womens_and_mens_divisions_do_not_mix(self):
        html = page(division_html("Flyweight", "A Champ", ranked("M")),
                    division_html("Women’s Flyweight", "B Champ", ranked("W")))
        got = r.parse_rankings(html, LABELS)
        self.assertEqual(got["flyweight"]["champion"], "A Champ")
        self.assertEqual(got["womens-flyweight"]["champion"], "B Champ")
        self.assertTrue(all(n.startswith("W ") for _, n in got["womens-flyweight"]["ranked"]))

    def test_ties_and_rank_movement_noise(self):
        rows = ranked("Fly", tie=13)
        html = page(division_html("Flyweight", "Joshua Van", rows, extra=" <span>Rank increased by 4</span>"))
        got = r.parse_rankings(html, LABELS)["flyweight"]["ranked"]
        self.assertEqual(sorted(rank for rank, _ in got).count(12), 2)
        self.assertEqual(len(got), 15)

    def test_single_node_rank_rows(self):
        html = ("<h2>All Rankings</h2><h4>Flyweight</h4><span>Champion</span><a>Joshua Van</a>"
                + "".join(f"<li>{i} · Name{i}</li>" for i in range(1, 13)))
        got = r.parse_rankings(html, LABELS)["flyweight"]
        self.assertEqual(len(got["ranked"]), 12)
        self.assertEqual(got["champion"], "Joshua Van")

    def test_missing_all_rankings_section_parses_nothing(self):
        self.assertEqual(r.parse_rankings("<h4>Flyweight</h4><a>x</a>", LABELS), {})

    def test_usable_rules(self):
        good = {"champion": "A", "ranked": ranked("X")}
        self.assertIsNone(r.usable(good))
        self.assertIn("champion", r.usable({"champion": None, "ranked": ranked("X")}))
        self.assertIn("only 3", r.usable({"champion": "A", "ranked": ranked("X", 3)}))
        self.assertIn("start at 1", r.usable({"champion": "A", "ranked": [(i, "n") for i in range(2, 14)]}))


class ApplyTests(unittest.TestCase):
    def previous(self):
        return {"schema": 1, "source": "UFCalendar", "divisions": {
            "flyweight": {"label": "Flyweight", "observedOn": "2026-11-20", "rankingDate": "2026-11-17",
                          "champion": {"slug": "joshua-van", "name": "Joshua Van"},
                          "ranked": [{"rank": 0, "slug": "joshua-van", "name": "Joshua Van"},
                                     {"rank": 1, "slug": "old-name-slug", "name": "Fly Fighter1"}],
                          "roster": ["joshua-van", "luis-gurule", "old-name-slug"]},
            "bantamweight": {"label": "Bantamweight", "observedOn": "2026-11-20", "rankingDate": "2026-11-17",
                             "champion": {"slug": "petr-yan", "name": "Petr Yan"},
                             "ranked": [{"rank": 0, "slug": "petr-yan", "name": "Petr Yan"}],
                             "roster": ["petr-yan"]}}}

    def test_replaces_good_division_keeps_roster_and_existing_slugs(self):
        parsed = r.parse_rankings(page(division_html("Flyweight", "Joshua Van", ranked("Fly"))), LABELS)
        doc, kept = r.apply(self.previous(), parsed, TODAY, divisions)
        fly = doc["divisions"]["flyweight"]
        self.assertEqual(fly["rankingDate"], "2026-11-22")  # ranks changed, so first-seen day
        self.assertEqual(fly["champion"]["slug"], "joshua-van")
        self.assertEqual(fly["ranked"][0], {"rank": 0, "slug": "joshua-van", "name": "Joshua Van"})
        self.assertEqual(fly["ranked"][1]["slug"], "old-name-slug")  # reuses the slug the site already has
        self.assertIn("luis-gurule", fly["roster"])  # nobody is dropped from a roster
        self.assertEqual(len(fly["ranked"]), 16)
        self.assertEqual(doc["fetchedDivisions"], 1)
        self.assertEqual(doc["source"], "ufc.com/rankings")
        self.assertEqual(doc["fighters"]["joshua-van"]["champion"], True)

    def test_unchanged_rankings_keep_their_ranking_date(self):
        prev = self.previous()
        prev["divisions"]["flyweight"]["ranked"] = [{"rank": 0, "slug": "joshua-van", "name": "Joshua Van"}] + [
            {"rank": rank, "slug": r.slugify(name), "name": name} for rank, name in ranked("Fly")]
        parsed = r.parse_rankings(page(division_html("Flyweight", "Joshua Van", ranked("Fly"))), LABELS)
        doc, _ = r.apply(prev, parsed, TODAY, divisions)
        self.assertEqual(doc["divisions"]["flyweight"]["rankingDate"], "2026-11-17")
        self.assertEqual(doc["divisions"]["flyweight"]["observedOn"], "2026-11-22")

    def test_unparsed_division_keeps_previous_data(self):
        parsed = r.parse_rankings(page(division_html("Flyweight", "Joshua Van", ranked("Fly"))), LABELS)
        doc, kept = r.apply(self.previous(), parsed, TODAY, divisions)
        self.assertEqual(doc["divisions"]["bantamweight"]["rankingDate"], "2026-11-17")
        self.assertEqual(kept["bantamweight"], "not on the page")
        self.assertIn("bantamweight", doc["diagnostics"])

    def test_partial_division_is_not_applied(self):
        parsed = r.parse_rankings(page(division_html("Flyweight", "Joshua Van", ranked("Fly", 4))), LABELS)
        doc, kept = r.apply(self.previous(), parsed, TODAY, divisions)
        self.assertIn("only 4", kept["flyweight"])
        self.assertEqual(doc["divisions"]["flyweight"]["rankingDate"], "2026-11-17")

    def test_main_writes_nothing_when_too_few_divisions_parse(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, out = pathlib.Path(tmp, "p.html"), pathlib.Path(tmp, "d.json")
            src.write_text(page(division_html("Flyweight", "Joshua Van", ranked("Fly"))), encoding="utf-8")
            out.write_text(json.dumps(self.previous()), encoding="utf-8")
            before = out.read_text(encoding="utf-8")
            self.assertEqual(r.main(["--html", str(src), "--out", str(out)]), 2)
            self.assertEqual(out.read_text(encoding="utf-8"), before)

    def test_main_writes_when_enough_divisions_parse(self):
        sections = [division_html(label, f"{label} Champ", ranked(label[:3]))
                    for label in list(divisions.DIVISIONS.values())[:9]]
        with tempfile.TemporaryDirectory() as tmp:
            src, out = pathlib.Path(tmp, "p.html"), pathlib.Path(tmp, "d.json")
            src.write_text(page(*sections), encoding="utf-8")
            out.write_text(json.dumps(self.previous()), encoding="utf-8")
            self.assertEqual(r.main(["--html", str(src), "--out", str(out)]), 0)
            self.assertEqual(json.loads(out.read_text(encoding="utf-8"))["fetchedDivisions"], 9)


if __name__ == "__main__":
    unittest.main()
