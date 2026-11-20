import datetime as dt, importlib.util, io, json, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("lang", ROOT / "scripts" / "refresh-language-news.py")
lang = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lang)
NOW = dt.datetime(2026, 11, 19, 5, 0, tzinfo=dt.timezone.utc)

RSS = """<rss><channel>
<item><title>井上尚弥が防衛成功 - 日刊スポーツ</title><link>https://news.google.com/rss/articles/AAA</link><pubDate>Thu, 19 Nov 2026 03:00:00 GMT</pubDate><source url="https://nikkansports.com">日刊スポーツ</source></item>
<item><title>怪しい記事 - ABEMA</title><link>https://news.google.com/rss/articles/BBB</link><pubDate>Thu, 19 Nov 2026 03:00:00 GMT</pubDate><source url="https://abema.tv">ABEMA</source></item>
<item><title>古い記事 - 日刊スポーツ</title><link>https://news.google.com/rss/articles/CCC</link><pubDate>Mon, 10 Nov 2026 03:00:00 GMT</pubDate><source url="https://nikkansports.com">日刊スポーツ</source></item>
<item><title>No source here</title><link>https://news.google.com/rss/articles/DDD</link><pubDate>Thu, 19 Nov 2026 03:00:00 GMT</pubDate></item>
</channel></rss>""".encode("utf-8")


class FakeDeepL:
    def __init__(self):
        self.calls = []
    def translate(self, texts, language):
        self.calls.append((texts, language))
        return ["EN: " + t for t in texts]


class LanguageNewsTests(unittest.TestCase):
    def setUp(self):
        self.config = json.loads((ROOT / "data" / "news-language-sources.json").read_text(encoding="utf-8"))

    def test_parse_strips_publisher_tail_and_skips_incomplete_items(self):
        items = lang.parse_items(RSS)
        self.assertEqual(len(items), 3)
        self.assertEqual(items[0]["title"], "井上尚弥が防衛成功")
        self.assertEqual(items[0]["publisher"], "日刊スポーツ")

    def test_only_recent_approved_publishers_are_kept(self):
        approved = lang.approved_names(self.config, "ja")
        chosen = lang.select(lang.parse_items(RSS), approved, "boxing", NOW)
        self.assertEqual([c["title"] for c in chosen], ["井上尚弥が防衛成功"])
        self.assertEqual(chosen[0]["publisherEnglish"], "Nikkan Sports")

    def test_approved_list_has_no_duplicates_and_the_japanese_list(self):
        for code in ("ja",):
            names = [lang.norm(p["name"]) for p in self.config[code]["approved"]]
            self.assertEqual(len(names), len(set(names)))
            self.assertGreaterEqual(len(names), 15)

    def test_translation_is_cached_and_only_new_headlines_are_sent(self):
        chosen = lang.select(lang.parse_items(RSS), lang.approved_names(self.config, "ja"), "boxing", NOW)
        cache, client = {}, FakeDeepL()
        usage = {"used": 1000, "limit": 500000}
        sent = lang.translate_new(chosen, "ja", cache, client, usage, NOW)
        self.assertEqual(sent, len("井上尚弥が防衛成功"))
        again = lang.translate_new(chosen, "ja", cache, client, usage, NOW)
        self.assertEqual(again, 0)
        self.assertEqual(len(client.calls), 1)

    def test_nothing_is_translated_when_allowance_is_short_or_unknown(self):
        chosen = lang.select(lang.parse_items(RSS), lang.approved_names(self.config, "ja"), "boxing", NOW)
        for usage in ({"used": 449999, "limit": 500000}, {"used": None, "limit": None}, None):
            client = FakeDeepL()
            self.assertEqual(lang.translate_new(chosen, "ja", {}, client, usage, NOW), 0)
            self.assertEqual(client.calls, [])

    def test_untranslated_headlines_are_never_published(self):
        chosen = lang.select(lang.parse_items(RSS), lang.approved_names(self.config, "ja"), "boxing", NOW)
        self.assertEqual(lang.build_stories(chosen, "ja", {}, NOW), [])
        cache = {lang.cache_key("ja", chosen[0]["title"]): {"en": "Inoue defends title", "at": NOW.isoformat()}}
        built = lang.build_stories(chosen, "ja", cache, NOW)
        self.assertEqual(built[0]["title"], "Inoue defends title")
        self.assertEqual(built[0]["originalTitle"], "井上尚弥が防衛成功")
        self.assertEqual(built[0]["translatedFrom"], "Japanese")
        self.assertTrue(built[0]["url"].startswith("https://"))

    def test_collect_survives_a_failing_search(self):
        def fetcher(url):
            if "%E5%A4%A7%E7%9B%B8%E6%92%B2" in url or "大相撲" in url:
                raise OSError("boom")
            return RSS
        found, report = lang.collect(self.config, NOW, fetcher)
        self.assertTrue(any("failed" in line for line in report))
        self.assertTrue(found["ja"])

    def test_deepl_host_follows_key_type_and_key_is_not_in_errors(self):
        self.assertIn("api-free", lang.DeepL("abc:fx").host)
        self.assertNotIn("api-free", lang.DeepL("abc").host)

    def test_usage_parsing(self):
        class R(io.BytesIO):
            def __enter__(self): return self
            def __exit__(self, *a): pass
        client = lang.DeepL("k:fx", opener=lambda req, timeout: R(b'{"character_count": 10, "character_limit": 500000}'))
        self.assertEqual(client.usage(), {"used": 10, "limit": 500000})
        self.assertEqual(lang.allowance_left({"used": 10, "limit": 500000}), 449990)


if __name__ == "__main__":
    unittest.main()
