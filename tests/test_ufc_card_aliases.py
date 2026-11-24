"""Tests for scripts/ufc_card_aliases.py and the alias data file. Offline."""
import importlib.util
import json
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("aliases", ROOT / "scripts/ufc_card_aliases.py")
aliases = importlib.util.module_from_spec(spec)
spec.loader.exec_module(aliases)


class Aliases(unittest.TestCase):
    def test_file_keys_are_lowercase_letters_and_digits(self):
        for k, v in aliases.load_aliases().items():
            self.assertRegex(k, r"^[a-z0-9]+$")
            self.assertRegex(v, r"^[a-z0-9]+$")

    def test_both_card_names_are_aliased(self):
        a = aliases.load_aliases()
        self.assertEqual(a["sharabutdinmagomedov"], "sharamagomedov")
        self.assertEqual(a["matthieulethoduclos"], "matthieuduclos")

    def test_with_aliases_adds_key_for_known_target(self):
        out = aliases.with_aliases({"sharamagomedov": "shara-magomedov"})
        self.assertEqual(out["sharabutdinmagomedov"], "shara-magomedov")
        self.assertNotIn("matthieulethoduclos", out)

    def test_with_aliases_never_overrides_an_existing_key(self):
        out = aliases.with_aliases({"sharabutdinmagomedov": "own", "sharamagomedov": "other"})
        self.assertEqual(out["sharabutdinmagomedov"], "own")

    def test_with_aliases_does_not_mutate_input(self):
        names = {"sharamagomedov": "shara-magomedov"}
        aliases.with_aliases(names)
        self.assertEqual(names, {"sharamagomedov": "shara-magomedov"})


if __name__ == "__main__":
    unittest.main()
