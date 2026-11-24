"""Offline checks for the boxing intake's event-page and Commons rules (no network)."""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("intake", ROOT / "scripts/boxing-portrait-intake.py")
intake = importlib.util.module_from_spec(spec)
spec.loader.exec_module(intake)

MATCHROOM_CARD = """
<div class="boxer-1"><div class="boxer-image"><img class="main" src="https://www.matchroomboxing.com/app/uploads/2023/07/Opetaia-1334x2000.png"></div>
<h2> <span class="first-name">Jai</span> <span class="last-name">Opetaia</span> <p class="vs-mobile">VS</p></h2></div>
<div class="boxer-2"><div class="boxer-image"><img class="main" src="https://www.matchroomboxing.com/app/uploads/2025/03/Opetaia-oppo.png"></div>
<h2> <span class="first-name">Claudio </span> <span class="last-name">Squeo</span></h2></div>
<div class="boxer-1"><div class="boxer-image"><img class="main" src="https://www.matchroomboxing.com/app/uploads/2025/07/WhatsApp-Image-30x17.jpeg"></div>
<h2><span>William</span> <span>Zepeda</span></h2></div>
<div class="boxer-2"><h2><span>TBC</span></h2></div>
"""


def test_matchroom_card_maps_names_to_photos():
    card = intake.parse_matchroom_event(MATCHROOM_CARD, "page")
    assert card["jai opetaia"][0].endswith("Opetaia-1334x2000.png")
    assert "tbc" not in card


def test_photo_must_carry_the_boxers_name():
    card = intake.parse_matchroom_event(MATCHROOM_CARD, "page")
    assert intake.name_in_file("Jai Opetaia", card["jai opetaia"][0])
    # The card reuses Opetaia's file for his opponent: refused, not guessed at.
    assert not intake.name_in_file("Claudio Squeo", card["claudio squeo"][0])
    # Salita names files by first name, or its start.
    assert intake.name_in_file("Stephanie Piñeiro", "https://x.supabase.co/a/2026-11/steph-72b4c2d0.png")
    assert not intake.name_in_file("Litzy Vázquez", "https://x.supabase.co/a/2026-11/steph-72b4c2d0.png")


def test_lazy_placeholders_are_not_photographs():
    assert intake.THUMBNAIL.search("https://m/app/uploads/2025/07/WhatsApp-Image-30x17.jpeg")
    assert intake.THUMBNAIL.search("https://m/app/uploads/2020/06/uk.svg")
    assert not intake.THUMBNAIL.search("https://m/app/uploads/2023/07/Opetaia-1334x2000.png")


def test_salita_hero_keyed_by_billing_order():
    html = ("<title>Vazquez vs Pineiro · Salita Promotions</title>"
            '<img src="https://ab.supabase.co/storage/v1/object/public/public-media/2026-10/vazquez-vs-pineiro-f8.jpeg">'
            '<img src="https://ab.supabase.co/storage/v1/object/public/public-media/2026-11/litzy-ea.png">'
            '<img src="https://ab.supabase.co/storage/v1/object/public/public-media/2026-11/steph-72.png">'
            "<p>Litzy Vázquez 9-0</p><p>Stephanie Piñeiro 10-1</p>")
    card = intake.parse_salita_event(html, "page")
    assert card["litzy vazquez"][0].endswith("litzy-ea.png")
    assert card["stephanie pineiro"][0].endswith("steph-72.png")


TOPRANK_SITEMAP = """<urlset>
<url><loc>https://www.toprank.com/fighters</loc></url>
<url><loc>https://www.toprank.com/fighters/angelo-leo</loc></url>
<url><loc>https://www.toprank.com/fighters/richard-torrez-jr</loc></url>
<url><loc>https://www.toprank.com/events/lopez-vs-leo</loc></url>
</urlset>"""

TOPRANK_PAGE = """<div class="fighter-hero__img" data-v-ec3da71e><img onerror="x" alt="Angelo Leo" loading="lazy"
srcset="https://api.toprank.com/storage/uploads/284/conversions/Leo-thumb.webp 1x"
src="https://api.toprank.com/storage/uploads/284/conversions/Leo-thumb.webp" data-v-ec3da71e></div>
<h1 class="title h1 alt white" data-v-ec3da71e><!--[-->Angelo Leo<!--]--></h1>"""


def test_toprank_roster_is_its_fighter_pages():
    roster = intake.parse_toprank(TOPRANK_SITEMAP, "sitemap")
    assert set(roster) == {"angelo leo", "richard torrez jr"}
    assert roster["angelo leo"] == (None, "https://toprank.com/fighters/angelo-leo")
    assert intake.norm("Richard Torrez Jr.") in roster


def test_toprank_photo_needs_printed_name_and_file_name():
    url = intake.toprank_hero(TOPRANK_PAGE, "Angelo Leo")
    assert url.endswith("/284/conversions/Leo-thumb.webp")
    # The page names someone else: refused, not guessed at.
    import pytest
    with pytest.raises(intake.Refused):
        intake.toprank_hero(TOPRANK_PAGE, "Luis Alberto Lopez")
    # The printed name matches but the file is somebody else's.
    with pytest.raises(intake.Refused):
        intake.toprank_hero(TOPRANK_PAGE.replace("Leo-thumb", "Lopez-thumb"), "Angelo Leo")
    assert intake.toprank_hero("<h1>Angelo Leo</h1>", "Angelo Leo") is None


def test_toprank_rows_carry_their_own_attestation():
    src = next(s for s in intake.SOURCES if s["id"] == "toprank")
    assert src["promoter"] == "Top Rank"
    assert src["attestation"] == intake.ATTESTATIONS["2026-11-24"]
    assert "Top Rank" in intake.ATTESTATIONS["2026-11-24"]
    assert all(a in intake.RIGHTS_NOTE for a in intake.ATTESTATIONS.values())


def test_commons_picks_and_rejections_are_disjoint():
    assert not set(intake.COMMONS_PICKS.values()) & set(intake.REVIEWED_OUT_FILES)
    for slug, title in intake.COMMONS_PICKS.items():
        assert title.startswith("File:"), slug


def test_agency_and_licence_gates():
    assert intake.AGENCY.search("Photo: Getty Images")
    assert intake.FREE_LICENCE.match("CC BY-SA 4.0")
    assert not intake.FREE_LICENCE.match("Fair use")


def test_transparent_cutout_keeps_headroom(tmp_path, monkeypatch):
    from PIL import Image
    im = Image.new("RGBA", (400, 1000), (0, 0, 0, 0))
    im.paste((200, 150, 120, 255), (180, 100, 220, 200))  # a head, crown at y=100
    im.paste((200, 150, 120, 255), (150, 200, 250, 900))  # and shoulders below it
    src = tmp_path / "cut.png"
    im.save(src)
    monkeypatch.setattr(intake, "OUT_DIR", tmp_path)
    files, _, _ = intake.process(src, "t", [])
    portrait = Image.open(tmp_path / files["portrait"]).convert("RGB")
    # The top rows are background, not the figure: the head is not cut.
    assert portrait.getpixel((portrait.width // 2, 1)) == portrait.getpixel((1, 1))
