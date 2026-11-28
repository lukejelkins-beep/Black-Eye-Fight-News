"""Tests for scripts/ufc_ratings.py (ratings v2). JS parity runs in CI (tests/ufc-ratings-parity.cjs)."""
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("ufc_ratings", ROOT / "scripts/ufc_ratings.py")
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)

STRONG = {"slpm": 5.0, "sapm": 2.0, "strAcc": .55, "strDef": .65, "kd15": .8, "td15": 4.0, "tdAcc": .5,
          "tdDef": .9, "sub15": 1.5, "rev15": .3, "ctrlShare": .45, "ctrlAgainstShare": .05, "kdAbs15": .05}
WEAK = {"slpm": 2.0, "sapm": 5.0, "strAcc": .35, "strDef": .45, "kd15": 0.0, "td15": .2, "tdAcc": .2,
        "tdDef": .5, "sub15": 0.0, "rev15": 0.0, "ctrlShare": .02, "ctrlAgainstShare": .4, "kdAbs15": .6}


class Formulas(unittest.TestCase):
    def test_striking_includes_strike_defence_by_hand(self):
        rates = {"slpm": 3.65, "sapm": 3.0, "strAcc": .45, "kd15": .5, "strDef": .55, "kdAbs15": .25}
        window = {"koWinShare": .25, "koLossShare": .125}
        # output as above; strDef (55-35)/40=50, sapm (3.0-6.0)/(1.2-6.0)=62.5, knockdowns absorbed (.25-1)/(0-1)=75,
        # KO losses (.125-.25)/(0-.25)=50
        scores = {"slpm": 50, "diffPm": 53, "strAcc": 50, "kd15": 50, "koWinShare": 50,
                  "strDef": 50, "sapm": 62.5, "kdAbs15": 75, "koLossShare": 50}
        W = r.STRIKING_WEIGHTS
        self.assertAlmostEqual(sum(W.values()), 1.0)
        self.assertAlmostEqual(W["strDef"] + W["sapm"] + W["kdAbs15"] + W["koLossShare"], .40, msg="defence is 40%")
        expected = sum(scores[k] * W[k] for k in W)
        self.assertAlmostEqual(r.raw_skill(rates, window, "striking"), expected, places=6)
        hittable = r.raw_skill({**rates, "strDef": .40, "kdAbs15": .9}, window, "striking")
        self.assertLess(hittable, expected - 8, "being hit and dropped lowers striking")
        stopped = r.raw_skill(rates, {**window, "koLossShare": .25}, "striking")
        self.assertLess(stopped, r.raw_skill(rates, {**window, "koLossShare": 0}, "striking"), "KO losses lower striking")

    def test_evidence_gates(self):
        no_grappling = {"slpm": 3, "sapm": 3, "ctrlShare": .2}
        self.assertIsNone(r.raw_skill(no_grappling, {"subWinShare": None}, "grappling"))
        self.assertIsNone(r.raw_skill({"ctrlShare": .3, "tdDef": .8}, {}, "wrestling"), "needs takedown rate")
        self.assertIsNone(r.raw_skill({"tdDef": .8, "kdAbs15": .1}, {}, "defence"), "needs strikes absorbed or defence")
        self.assertIsNone(r.raw_skill({"slpm": 4}, {}, "striking"), "one component is not enough")

    def test_implausible_values_are_dropped_like_the_engine(self):
        # Real case: 8.3 knockdowns per 15 min from a short, finish-heavy sample.
        rates = {"slpm": 5.324, "sapm": 1.921, "strAcc": .67, "kd15": 8.289}
        window = {"koWinShare": .6314}
        # the 8.3 is dropped as missing, so striking is the weighted mean of the parts that are present
        W = r.STRIKING_WEIGHTS
        present = {"slpm": 79.368, "diffPm": 100, "strAcc": 100, "koWinShare": 100, "sapm": 84.979}
        expected = sum(v * W[k] for k, v in present.items()) / sum(W[k] for k in present)
        self.assertAlmostEqual(r.raw_skill(rates, window, "striking"), expected, places=2)
        self.assertIsNone(next(d for d in r.drivers(rates, window, "striking") if d["key"] == "kd15")["value"])

    def test_lower_is_better_components(self):
        good = r.raw_skill({"sapm": 1.5, "strDef": .7}, {}, "defence")
        bad = r.raw_skill({"sapm": 5.5, "strDef": .4}, {}, "defence")
        self.assertGreater(good, bad)

    def test_drivers_explain_each_component(self):
        d = r.drivers(STRONG, {"koWinShare": .3, "subWinShare": .1}, "striking")
        self.assertEqual([x["key"] for x in d], ["slpm", "diffPm", "strAcc", "kd15", "koWinShare", "strDef", "sapm", "kdAbs15", "koLossShare"])
        self.assertEqual(sum(x["weight"] for x in d), 1.0)
        self.assertEqual(d[0]["value"], 5.0)
        self.assertTrue(all(0 <= x["score"] <= 100 for x in d if x["score"] is not None))


class Scale(unittest.TestCase):
    def test_percentile_is_mid_rank_and_never_0_or_100(self):
        self.assertEqual(r.percentile(5, list(range(1, 11))), 45)
        self.assertEqual(r.percentile(3, [3, 3, 3, 3]), 50)
        self.assertEqual(r.percentile(1000, list(range(500))), 99)
        self.assertEqual(r.percentile(-1, list(range(500))), 1)
        self.assertIsNone(r.percentile(None, [1, 2]))

    def test_percentile_score_is_the_same_rank_to_two_decimals(self):
        # Owner, 28 Nov 2026: shown as "99.92", not "99th". Display only; percentile() is unchanged.
        self.assertEqual(r.percentile_score(5, list(range(1, 11))), 45.0)
        self.assertEqual(r.percentile_score(499, list(range(500))), 99.9)
        self.assertEqual(r.percentile_score(498, list(range(500))), 99.7)
        self.assertEqual(r.percentile_score(10**6, [1]), 99.99)
        self.assertEqual(r.percentile_score(-1, [1, 2]), 0.01)
        self.assertIsNone(r.percentile_score(None, [1]))
        pop = [x / 7 for x in range(593)]
        for v in pop[::37]:
            if 1 < r.percentile(v, pop) < 99:   # the whole percentile is held at 1 and 99; the score is not
                self.assertLessEqual(abs(r.percentile_score(v, pop) - r.percentile(v, pop)), 0.5)

    def test_shrink_toward_mean(self):
        self.assertEqual(r.shrink(80, 40, 4), 60)
        self.assertAlmostEqual(r.shrink(80, 40, 36), 76)


class Form(unittest.TestCase):
    def hist(self, outcomes):
        return [{"boutId": str(i), "outcome": o, "opponentSlug": "o%d" % i, "opponent": "O%d" % i}
                for i, o in enumerate(outcomes)]

    def test_matches_the_js_recent_form(self):
        # JS test: win, loss, no contest, draw, win -> 58
        self.assertEqual(r.recent_form(self.hist(["W", "L", "NC", "D", "W"])), 58)
        self.assertIsNone(r.recent_form(self.hist(["W"])))

    def test_opponent_strength_shift_is_bounded(self):
        h = self.hist(["W", "W", "L"])
        plain = r.recent_form(h)
        self.assertEqual(r.recent_form(h, lambda f: .5), plain)
        self.assertGreater(r.recent_form(h, lambda f: 1.0), plain)
        self.assertLess(r.recent_form(h, lambda f: 0.0), plain)
        self.assertLessEqual(r.recent_form(self.hist("WWWWW"), lambda f: 1.0), 100)

    def test_overall_needs_three_skills_and_form(self):
        self.assertIsNone(r.overall({"striking": 50, "grappling": 50, "wrestling": None, "defence": None, "form": 60}))
        self.assertEqual(r.overall({"striking": 60, "grappling": 40, "wrestling": 50, "defence": None, "form": 80}),
                         round((60 * .25 + 40 * .15 + 50 * .2 + 80 * .15) / .75))


def bouts_for(fighters):
    """The bout list the build would pass: every fight once, dated in history order (newest first)."""
    out, seen = [], set()
    for slug, f in fighters.items():
        for j, h in enumerate(f["history"]):
            if h["boutId"] in seen:
                continue
            seen.add(h["boutId"])
            out.append({"boutId": h["boutId"], "date": "2025-%02d-01" % (12 - j), "a": slug, "b": h["opponentSlug"],
                        "outcome": h["outcome"], "method": "dec", "methodDetail": "Unanimous"})
    return out


class Roster(unittest.TestCase):
    def rate(self, fighters, bouts=None):
        return r.rate_roster(fighters, bouts_for(fighters) if bouts is None else bouts, "2026-01-01")

    def roster(self):
        fighters = {}
        for i in range(40):
            t = i / 39
            rates = {k: WEAK[k] + (STRONG[k] - WEAK[k]) * t for k in STRONG}
            fighters["f%02d" % i] = {
                "window": {"statFights": 6, "effectiveFights": 5.0, "rates": rates,
                           "koWinShare": .4 * t, "subWinShare": .3 * t},
                "history": [{"boutId": "%d-%d" % (i, j), "outcome": "W" if j < 1 + 3 * t else "L",
                             "opponentSlug": "f%02d" % ((i + j + 1) % 40), "opponent": "x"} for j in range(5)],
                "divisionSlug": "lightweight" if i % 2 else "welterweight"}
        return fighters

    def test_best_and_worst_land_at_the_ends(self):
        out = self.rate(self.roster())
        for k in r.SKILLS:
            self.assertGreaterEqual(out["f39"]["skills"][k]["roster"], 90, k)
            self.assertLessEqual(out["f00"]["skills"][k]["roster"], 10, k)
        self.assertGreater(out["f39"]["overall"], out["f00"]["overall"])

    def test_division_percentiles_need_enough_peers(self):
        fighters = self.roster()
        out = self.rate(fighters)
        self.assertIsNotNone(out["f39"]["skills"]["striking"]["division"], "20 lightweights is enough")
        fighters["f39"]["divisionSlug"] = "flyweight"  # alone in the division
        self.assertIsNone(self.rate(fighters)["f39"]["skills"]["striking"]["division"])

    def test_small_samples_are_not_rated_and_shrink(self):
        fighters = self.roster()
        fighters["f39"]["window"]["statFights"] = 2
        out = self.rate(fighters)
        self.assertFalse(out["f39"]["eligible"], "two measured fights is not a full rating")
        self.assertTrue(out["f39"]["provisional"])
        thin = self.roster()
        thin["f39"]["window"]["effectiveFights"] = .5
        self.assertLess(self.rate(thin)["f39"]["skills"]["striking"]["roster"],
                        self.rate(self.roster())["f39"]["skills"]["striking"]["roster"])

    def test_form_records_opponent_strength(self):
        out = self.rate(self.roster())
        opponents = out["f20"]["form"]["opponents"]
        self.assertEqual(len(opponents), 5)
        self.assertTrue(all(o["strength"] is None or 0 <= o["strength"] <= 1 for o in opponents))

    def test_provisional_ratings_never_move_anyone_else(self):
        base = self.roster()
        extra = self.roster()
        extra["new1"] = {"window": {"statFights": 1, "effectiveFights": .9, "rates": dict(STRONG),
                                    "koWinShare": .9, "subWinShare": .9},
                         "history": [{"boutId": "n-1", "outcome": "W", "opponentSlug": "f05", "opponent": "x"}],
                         "divisionSlug": "lightweight"}
        extra["new2"] = {"window": {"statFights": 2, "effectiveFights": 1.7, "rates": dict(WEAK),
                                    "koWinShare": 0, "subWinShare": 0},
                         "history": [{"boutId": "n-2", "outcome": "L", "opponentSlug": "f06", "opponent": "x"}] * 2,
                         "divisionSlug": "lightweight"}
        # A fight exists whatever the fighter's rating status, so both runs see the same bouts.
        before = self.rate(base, bouts_for(extra))
        after = self.rate(extra, bouts_for(extra))
        for slug in base:
            self.assertEqual(before[slug], after[slug], slug)
        for slug in ("new1", "new2"):
            self.assertFalse(after[slug]["eligible"])
            self.assertTrue(after[slug]["provisional"])
            self.assertIsNone(after[slug]["opponentStrength"], "a provisional fighter is never used as opponent strength")
        self.assertGreater(after["new1"]["skills"]["striking"]["roster"], after["new2"]["skills"]["striking"]["roster"])

    def test_established_and_unmeasured_fighters_are_not_provisional(self):
        extra = self.roster()
        extra["none"] = {"window": {"statFights": 0, "rates": {}}, "history": [], "divisionSlug": None}
        out = self.rate(extra)
        self.assertFalse(out["f39"]["provisional"])
        self.assertFalse(out["none"]["provisional"])
        self.assertIsNone(out["none"]["skills"]["striking"]["roster"])


    def test_headline_is_centred_on_the_median_established_fighter(self):
        out = self.rate(self.roster())
        established = sorted(v["overallRating"] for v in out.values() if v["eligible"])
        self.assertEqual(established[len(established) // 2], r.HEADLINE_CENTRE)
        self.assertGreater(out["f39"]["overallRating"], r.HEADLINE_CENTRE)
        self.assertLess(out["f00"]["overallRating"], r.HEADLINE_CENTRE)
        self.assertEqual(out["f39"]["overall"], r.score_100(out["f39"]["overallRating"]))

    def test_age_adjustment(self):
        # owner request 25 Nov 2026: age in the headline (tested on 2024+ bouts: 62.7% -> 64.1%)
        self.assertEqual(r.age_points(None, "2026-11-21"), 0.0, "unknown birth date: no adjustment")
        self.assertAlmostEqual(r.age_points("1995-11-21", "2026-11-21"), 0.0, delta=.05, msg="31: the centre")
        self.assertAlmostEqual(r.age_points("2000-11-21", "2026-11-21"), 5 * r.AGE_POINTS_PER_YEAR, delta=.1)
        self.assertAlmostEqual(r.age_points("1986-11-21", "2026-11-21"), -9 * r.AGE_POINTS_PER_YEAR, delta=.1)
        self.assertEqual(r.age_points("1990-01-01", None), 0.0)
        roster = self.roster()
        young = {s: {**f, "born": "2001-01-01"} for s, f in roster.items()}
        old = {s: {**f, "born": "1988-01-01"} for s, f in roster.items()}
        base = self.rate(roster)
        for s in ("f39", "f20"):
            if base[s]["overallRating"] is not None:
                self.assertEqual(base[s]["ageAdjustment"], 0.0)
        y, o = self.rate({**roster, "f39": young["f39"]}), self.rate({**roster, "f39": old["f39"]})
        self.assertGreater(y["f39"]["overallRating"], o["f39"]["overallRating"])

    def test_height_adjustment(self):
        # owner, 25 Nov 2026: height against the division average (2024+ walk-forward 64.1% -> 65.0%)
        roster = {f"h{i}": {"height": 70, "divisionSlug": "lightweight"} for i in range(5)}
        avg = r.division_heights({**roster, "tall": {"height": 75, "divisionSlug": "lightweight"}})
        self.assertAlmostEqual(avg["lightweight"], 70 + 5 / 6)
        self.assertEqual(r.division_heights({"a": {"height": 70, "divisionSlug": "x"}}), {}, "needs 5 fighters")
        self.assertAlmostEqual(r.height_points(73, 70), 3 * r.HEIGHT_POINTS_PER_INCH)
        self.assertAlmostEqual(r.height_points(67, 70), -3 * r.HEIGHT_POINTS_PER_INCH)
        self.assertEqual(r.height_points(None, 70), 0.0)
        self.assertEqual(r.height_points(72, None), 0.0)

    def test_score_out_of_100_and_rank(self):
        self.assertEqual(r.score_100(r.HEADLINE_CENTRE), 50)
        self.assertEqual(r.score_100(r.HEADLINE_CENTRE + 11 * r.SCORE_DIVISOR), 61)
        self.assertEqual(r.score_100(r.HEADLINE_CENTRE + 4), 50.5, "2 decimal places, not a whole number")
        self.assertEqual(r.score_100(r.HEADLINE_CENTRE + 3.6), 50.45)
        self.assertEqual(r.score_100(5000), 99.99)
        self.assertEqual(r.score_100(0), 1)
        self.assertIsNone(r.score_100(None))
        out = self.rate(self.roster())
        rated = sorted((v["overallRating"], v["overallRank"]) for v in out.values() if v["eligible"])
        self.assertEqual(rated[-1][1], 1, "the highest rating ranks first")
        self.assertTrue(all(a[1] >= b[1] for a, b in zip(rated, rated[1:])), "ranks follow the full rating")
        self.assertTrue(all(v["rankOf"] == len(rated) for v in out.values()))
        self.assertGreater(out["f39"]["overallPercentile"], out["f00"]["overallPercentile"])

    def test_women_and_men_are_rated_as_separate_pools(self):
        # 40 fighters, the top and bottom halves split between women and men: ranks, percentiles and the centre must
        # each be worked out inside the pool (owner, 26 Nov 2026), so each pool has its own #1 and its own median.
        fighters = self.roster()
        for i, f in enumerate(fighters.values()):
            f["divisionSlug"] = ("womens-strawweight" if i % 4 < 2 else "lightweight")
        out = self.rate(fighters)
        women = {s for s, f in fighters.items() if r.pool_of(f) == "women"}
        self.assertEqual(len(women), 20)
        self.assertTrue(all((out[s]["pool"] == "women") == (s in women) for s in out))
        for pool, members in (("women", women), ("men", set(fighters) - women)):
            rated = [out[s] for s in members if out[s]["eligible"]]
            self.assertTrue(rated, pool)
            self.assertTrue(all(v["rankOf"] == len(rated) for v in rated), pool + ": rankOf is the pool size")
            self.assertEqual(sorted(v["overallRank"] for v in rated)[0], 1, pool + " has its own #1")
            best = max(rated, key=lambda v: v["overallRating"])
            self.assertEqual(best["overallRank"], 1)
        # a skill percentile is placed against the pool: the weakest woman is near 0 even if she beats some men
        weakest = min((out[s] for s in women), key=lambda v: v["skills"]["striking"]["roster"])
        self.assertLessEqual(weakest["skills"]["striking"]["roster"], 15)

    def test_pool_override_and_default(self):
        self.assertEqual(r.pool_of({"divisionSlug": "womens-flyweight"}), "women")
        self.assertEqual(r.pool_of({"divisionSlug": "flyweight"}), "men")
        self.assertEqual(r.pool_of({"divisionSlug": None}), "men", "no evidence: men, as before")
        self.assertEqual(r.pool_of({"divisionSlug": None, "pool": "women"}), "women", "the builder infers the pool")
        self.assertEqual(r.pool_of({"divisionSlug": "flyweight", "pool": "bogus"}), "men")

    def test_no_bouts_means_no_headline(self):
        out = r.rate_roster(self.roster())
        self.assertIsNone(out["f20"]["overall"])
        self.assertFalse(out["f20"]["eligible"])


def bout(a, b, outcome="W", date="2025-01-01", method="dec", detail="Unanimous", bid=None):
    return {"boutId": bid or f"{a}-{b}-{date}", "date": date, "a": a, "b": b, "outcome": outcome,
            "method": method, "methodDetail": detail}


class Results(unittest.TestCase):
    def test_a_title_fighter_is_not_drifted_while_idle(self):
        # x's last fight is a title fight (or not); three years later x fights again. A title fighter's rating is
        # not drifted back toward 1500 before that fight, so an opponent who beats them is not discounted for the layoff.
        def walk(title):
            bouts = [bout("x", "y", date="2020-01-01", method="sub", detail="", bid="1") | {"titleFight": title},
                     bout("z", "x", date="2023-06-01", bid="2")]
            _, pre = r.results_walk(bouts)
            return pre[1][2]    # x's rating going into the second fight (x is corner b there)
        title, plain = walk(True), walk(False)
        self.assertGreater(title, plain, "the idle title fighter keeps their rating")
        self.assertGreater(plain, r.RESULTS_MEAN, "the plain fighter has drifted toward 1500 but is still above it")

    def test_beating_a_strong_opponent_counts_more(self):
        # "strong" has beaten three fighters; "weak" has lost three. x beats strong, y beats weak.
        history = [bout("strong", "o%d" % i, date="2024-0%d-01" % (i + 1)) for i in range(3)]
        history += [bout("weak", "p%d" % i, "L", date="2024-0%d-01" % (i + 1)) for i in range(3)]
        history += [bout("x", "strong", date="2025-01-01"), bout("y", "weak", date="2025-01-01")]
        res = r.results_as_of(history, "2025-02-01")
        self.assertGreater(res["x"]["rating"], res["y"]["rating"])

    def test_finish_counts_more_and_split_less(self):
        ko = r.results_as_of([bout("a", "b", method="ko")], "2025-02-01")["a"]["rating"]
        ud = r.results_as_of([bout("a", "b")], "2025-02-01")["a"]["rating"]
        split = r.results_as_of([bout("a", "b", detail="Split")], "2025-02-01")["a"]["rating"]
        self.assertGreater(ko, ud)
        self.assertGreater(ud, split)
        self.assertGreater(split, r.RESULTS["start"])

    def test_title_fight_counts_more(self):
        plain = r.results_as_of([bout("a", "b")], "2025-02-01")["a"]["rating"]
        title = r.results_as_of([{**bout("a", "b"), "titleFight": True}], "2025-02-01")["a"]["rating"]
        self.assertGreater(title, plain)
        self.assertAlmostEqual(title - r.RESULTS["start"], (plain - r.RESULTS["start"]) * r.RESULTS["title"])

    def test_pre_ufc_record_sets_the_starting_rating(self):
        pri = r.pre_ufc_priors({"unbeaten": (16, 1), "middling": (8, 4), "poor": (3, 5)})
        self.assertGreater(pri["unbeaten"], pri["middling"])
        self.assertGreater(pri["middling"], pri["poor"])
        self.assertEqual(pri["middling"], r.RESULTS_MEAN, "the median pre-UFC record starts at 1500")
        self.assertEqual(r.pre_ufc_priors({}), {})
        self.assertEqual(r.pre_ufc_priors({"x": (5, 0)}, scale=0), {})
        # a debut win over the poor-record opponent gains less than the same win over the unbeaten one
        beat_poor = r.results_as_of([bout("a", "poor")], "2025-02-01", prior=pri)["a"]["rating"]
        beat_best = r.results_as_of([bout("a", "unbeaten")], "2025-02-01", prior=pri)["a"]["rating"]
        self.assertGreater(beat_best, beat_poor)

    def test_draw_and_no_contest(self):
        draw = r.results_as_of([bout("a", "b", "D")], "2025-02-01")
        self.assertAlmostEqual(draw["a"]["rating"], draw["b"]["rating"])
        self.assertEqual(r.results_as_of([bout("a", "b", "NC")], "2025-02-01"), {})

    def test_idle_rating_drifts_back_after_a_year(self):
        wins = [bout("a", "o%d" % i, date="2022-0%d-01" % (i + 1)) for i in range(5)]
        fresh = r.results_as_of(wins, "2022-12-01")["a"]["rating"]
        idle = r.results_as_of(wins, "2025-06-01")["a"]["rating"]
        self.assertGreater(fresh, idle)
        self.assertGreater(idle, r.RESULTS_MEAN)

    def test_ratings_only_use_earlier_fights(self):
        _, pre = r.results_walk([bout("a", "b", date="2025-01-01"), bout("a", "c", date="2024-01-01")])
        self.assertEqual([b["b"] for b, *_ in pre], ["c", "b"])
        self.assertEqual(pre[0][1], r.RESULTS["start"])


class Effectiveness(unittest.TestCase):
    def test_wrestling_credits_takedowns_stopped(self):
        base = {"td15": .2, "tdAcc": None, "ctrlShare": .05, "ctrlAgainstShare": .05}
        stops = r.raw_skill({**base, "tdDef": .9}, {}, "wrestling")
        concedes = r.raw_skill({**base, "tdDef": .4}, {}, "wrestling")
        W = r.WRESTLING_WEIGHTS
        present = sum(W[k] for k in ("td15", "ctrlShare", "tdDef", "ctrlAgainstShare"))   # tdAcc and rev15 missing
        # takedown defence .9 scores 90.9, .4 scores 0 on its 40-95% range
        self.assertAlmostEqual(stops - concedes, 90.909 * W["tdDef"] / present, places=2)
        self.assertGreater(stops, concedes)

    def test_offence_and_defence_split_60_40(self):
        for W, defence in ((r.WRESTLING_WEIGHTS, ("tdDef", "tdAbs15", "ctrlAgainstShare", "rev15")),
                           (r.GRAPPLING_WEIGHTS, ("subLossShare", "subAbs15", "rev15", "ctrlAgainstShare")),
                           (r.STRIKING_WEIGHTS, ("strDef", "sapm", "kdAbs15", "koLossShare"))):
            self.assertAlmostEqual(sum(W.values()), 1.0)
            self.assertAlmostEqual(sum(W[k] for k in defence), .40)

    def test_wrestling_counts_being_taken_down(self):
        base = {"td15": 1, "tdDef": .7, "ctrlShare": .2, "ctrlAgainstShare": .1}
        rarely = r.raw_skill({**base, "tdAbs15": .3}, {}, "wrestling")
        often = r.raw_skill({**base, "tdAbs15": 2.4}, {}, "wrestling")
        self.assertGreater(rarely, often, "same defence % but taken down far more often")

    def test_wrestling_counts_control_conceded(self):
        a = r.raw_skill({"td15": 1, "tdDef": .7, "ctrlShare": .2, "ctrlAgainstShare": .0}, {}, "wrestling")
        b = r.raw_skill({"td15": 1, "tdDef": .7, "ctrlShare": .2, "ctrlAgainstShare": .3}, {}, "wrestling")
        self.assertGreater(a, b)

    def test_grappling_credits_not_being_submitted(self):
        rates = {"sub15": 0.0, "rev15": 0.0, "subAbs15": .2, "ctrlShare": .05, "ctrlAgainstShare": .05}
        safe = r.raw_skill(rates, {"subWinShare": 0, "subLossShare": 0}, "grappling")
        tapped = r.raw_skill(rates, {"subWinShare": 0, "subLossShare": .25}, "grappling")
        # all seven parts present: a submission loss every fourth fight costs the whole submission-loss weight
        self.assertAlmostEqual(safe - tapped, 100 * r.GRAPPLING_WEIGHTS["subLossShare"], places=6)
        self.assertGreater(safe, tapped)

    def test_drivers_weights_sum_to_one(self):
        for skill in r.SKILLS:
            self.assertAlmostEqual(sum(d["weight"] for d in r.drivers(STRONG, {}, skill)), 1.0, msg=skill)


class WindowedResults(unittest.TestCase):
    """results_in_window: the results part of a rating built from only a window's bouts (owner, 28 Nov 2026)."""

    def bouts(self):
        mk = lambda i, date, a, b, o: {"boutId": i, "date": date, "a": a, "b": b, "outcome": o, "method": "dec",
                                       "methodDetail": "Unanimous"}
        return [mk("old", "2023-01-01", "ann", "bea", "W"), mk("mid", "2025-03-01", "ann", "cat", "W"),
                mk("new", "2026-05-01", "bea", "cat", "L")]

    def test_only_counted_bouts_move_a_rating_and_only_for_the_counted_fighter(self):
        _state, pre = r.results_walk(self.bouts())
        out = r.results_in_window(pre, {"ann": {"mid"}, "bea": set(), "cat": {"mid"}}, "2026-06-01")
        self.assertEqual(out["ann"]["fights"], 1)
        self.assertEqual(out["cat"]["fights"], 1)
        self.assertNotIn("bea", out, "a fighter with no bout in the window is not in the results")
        self.assertGreater(out["ann"]["rating"], r.RESULTS_MEAN)
        self.assertLess(out["cat"]["rating"], r.RESULTS_MEAN)

    def test_opponent_is_valued_at_their_career_rating_going_in(self):
        _state, pre = r.results_walk(self.bouts())
        mid = next(x for x in pre if x[0]["boutId"] == "mid")
        _bout, ann_going_in, cat_going_in = mid[0], mid[1], mid[2]
        out = r.results_in_window(pre, {"ann": {"mid"}}, "2025-03-01")
        expected = 1 / (1 + 10 ** ((cat_going_in - r.RESULTS_MEAN) / 400))
        want = r.RESULTS_MEAN + r.RESULTS["k"] * (1 + r.RESULTS["boost"]) * (1 - expected)
        self.assertAlmostEqual(out["ann"]["rating"], want, places=6)
        self.assertGreater(ann_going_in, r.RESULTS_MEAN, "ann had already won in 2023, cat is valued as the weaker side")

    def test_wider_window_counts_more_fights(self):
        _state, pre = r.results_walk(self.bouts())
        narrow = r.results_in_window(pre, {"ann": {"mid"}}, "2026-06-01")
        wide = r.results_in_window(pre, {"ann": {"old", "mid"}}, "2026-06-01")
        self.assertEqual((narrow["ann"]["fights"], wide["ann"]["fights"]), (1, 2))

    def test_rate_roster_with_ready_results_matches_the_default_path(self):
        helper = Roster()
        fighters = helper.roster()
        bouts = bouts_for(fighters)
        default = r.rate_roster(fighters, bouts, "2026-01-01")
        ready = r.rate_roster(fighters, None, "2026-01-01", None, results=r.results_as_of(bouts, "2026-01-01"))
        self.assertEqual(default, ready)


if __name__ == "__main__":
    unittest.main()