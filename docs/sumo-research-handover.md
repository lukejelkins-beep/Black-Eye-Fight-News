# BEFN Sumo Stories: handover for research in a normal Claude chat

**Prepared:** 21 November 2026 · **For:** a normal Claude chat (web search on), not Claude Code
**Owner:** the BEFN site owner · **Site:** Black Eye Fight News, Sumo preview (not yet on the public site)

## What I need from you

You are the **research desk** for BEFN's Sumo Stories feature. Find **true, surprising, well-sourced facts about current sumo wrestlers**, and give them to the owner in the exact format below. The owner pastes your output into Claude Code, which adds it to the site.

You do **not** edit code, run the site or merge anything. Research, verify, write.

## What's already live (so you don't duplicate it)

The site runs a **fact engine** that calculates these automatically from BEFN's stored bout records. **Don't research these:**
- Head-to-head series, streaks, clean sweeps, first meetings, favourite finishing move against an opponent
- Number of different winning techniques, signature move %, rare moves
- Final-day 7–7 record, comebacks from 0–4, weight and age gaps
- Rising stars (fast climbs, big three-basho climbs), current-basho form, win % leaders

These are already in the manual editorial file (**don't repeat them**):
onami-brothers (Wakamotoharu and Wakatakakage) · koto-brothers (Kotoshoho and Kotoeiho) · hoshoryu-uncle (Asashoryu) · oho-dynasty (Takatoriki and Taiho) · tamawashi-ironman (consecutive bouts, Guinness) · isegahama-202607-playoff (Toshinofuji v Arashifuji Jūryō playoff) · asahifuji-title-run (four division titles in four basho)

## What to research (in priority order)

1. **Official honours (JSA):** kinboshi counts, special prizes (sanshō), division titles, fastest promotions *as stated by the JSA or a major outlet*.
2. **Families and roots:** brothers, fathers, uncles, famous relatives; notable hometowns; school or university sumo backgrounds; first wrestler from a country or prefecture.
3. **Before sumo:** other sports, amateur titles (e.g. collegiate yokozuna), unusual paths into sumo.
4. **Records and milestones:** genuine records held, or *documented* proximity to one (e.g. "two wins from his 500th career win", using JSA career totals).
5. **Stablemate playoffs:** documented championship playoffs between wrestlers from the same stable (both must still be active).
6. **Pre-basho storylines** (before each tournament): promotion chases, an ozeki who must win eight to keep his rank (kadoban), returns from injury, first-time sekitori.

Only wrestlers in the **tracked roster** at the end of this document can appear.

## Decision rules (owner-approved)

**Source levels**
- **A · Official:** sumo.or.jp (JSA) pages. Best source.
- **C · Researched:** reputable media (NHK, Japan Times, Kyodo, Nikkan Sports and similar), Wikipedia, Guinness. Needs **two independent sources**, or one strong source that the owner approves. Every fact needs a link.
- **D · Never:** match-fixing hints, injury guesses, private life, rumours, anything you can't link to a source.

**Wording**
- One or two plain sentences. Lead with the striking part, with a number if there is one.
- No superlative ("first ever", "most ever", "record") unless a source says exactly that. Keep any scope the source gives ("first Ukrainian-born ozeki", not "first European").
- Say "according to the JSA" or similar when it helps the reader.
- Never invent numbers. If you can't confirm one, leave the fact out.

**Is it interesting enough?** Only bring facts a sumo fan would say "huh!" about. Rare beats common, current beats old, specific beats vague. Five great facts beat twenty ordinary ones.

## Output format (exactly this, so it can be pasted into the site file)

Give a JSON array of items. `memberIds` must use the **numbers from the roster below**. `verifiedAt` is today's date in **UTC** (YYYY-MM-DD).

```json
[
  {
    "id": "short-kebab-id",
    "kind": "family",
    "title": "Short headline, 3–7 words",
    "short": "One or two sentences with the fact, scoped exactly as the source states it.",
    "memberIds": [19],
    "tag": "FAMILY TIES",
    "sourceLabel": "Japan Sumo Association rikishi profile",
    "sourceUrl": "https://www.sumo.or.jp/...",
    "verifiedAt": "2026-11-21"
  }
]
```

- **`kind`:** `family` (family and roots), `record` (records and honours; re-checked every 90 days), `rising` (newcomers and fast risers), or `stablemates` (playoffs between stablemates).
- **`tag` examples:** FAMILY TIES · RECORD HOLDER · RISING STAR · HONOURS · BEFORE SUMO.
- **Stablemate playoffs only:** add `"eventType": "championship-playoff"`, `"bashoId": "YYYYMM"`, `"stable"`, `"winnerId"` and `"loserId"`. Both wrestlers must be in the roster and in that stable now.

After the JSON, add a short list per item: **second source URL** (for level C), **anything uncertain**, and **anything the owner should approve**.

## Useful sources
- JSA wrestler profile (Japanese, has past basho results and 優勝 marks): `https://www.sumo.or.jp/ResultRikishiData/profile/<JSA id>/`. The JSA id is not the BEFN id; find it through the JSA site search or a news link.
- JSA English profiles: https://www.sumo.or.jp/EnSumoDataRikishi/search
- JSA stables: https://www.sumo.or.jp/EnSumoDataSumoBeya/wrap
- Sumo Reference (sumodb.sumogames.de) often returns errors to automated tools; fine to use if it loads.

## Still open in the code (for Claude Code, not for you)
- A one-line guard so kimarite pages never show "No … wins" while the per-technique data is missing.
- Phase 3: rebuild Fun Facts as the "Sumo Stories" hub (fact of the day, themed rows, pair search); move Win % to Leaderboards with preset windows.
- Phase 4: automatic JSA reader for honours and career totals; weekly research batches (your output feeds this).

## Tracked roster (name, BEFN id, stable) · as of 21 Nov 2026

**Makuuchi (42):** Onosato 8850 (Nishonoseki), Aonishiki 8854 (Ajigawa), Kirishima 7 (Otowayama), Fujinokawa 615 (Isenoumi), Churanoumi 71 (Kise), Asanoyama 2 (Takasago), Ura 28 (Kise), Takayasu 44 (Tagonoura), Takerufuji 5 (Isegahama), Hiradoumi 24 (Sakaigawa), Kotoshoho 8 (Sadogatake), Wakamotoharu 13 (Arashio), Roga 55 (Futagoyama), Oshoma 61 (Naruto), Shishi 86 (Ikazuchi), Takanosho 37 (Minatogawa), Ichiyamamoto 11 (Hanaregoma), Toshinofuji 8866 (Isegahama), Tokihayate 83 (Tokitsukaze), Tamawashi 14 (Kataonami), Arashifuji 8858 (Isegahama), Daiseizan 378 (Arashio), Hoshoryu 19 (Tatsunami), Kotozakura 20 (Sadogatake), Atamifuji 74 (Isegahama), Yoshinofuji 8857 (Isegahama), Fujiryoga 9051 (Fujishima), Fujiseiun 82 (Fujishima), Hakunofuji 3 (Isegahama), Daieisho 9 (Oitekaze), Gonoyama 56 (Takekuma), Kotoeiho 112 (Sadogatake), Kinbozan 50 (Kise), Nishikifuji 40 (Isegahama), Asakoryu 164 (Takasago), Oho 41 (Otake), Asahakuryu 607 (Takasago), Abi 22 (Shikoroyama), Asasuiryu 8859 (Takasago), Dewanoryu 135 (Dewanoumi), Kitanowaka 66 (Hakkaku), Kyokukaiyu 8855 (Oshima)
**Juryo (28):** Chiyoshoma 39 (Kokonoe), Kazekeno 78 (Oshiogawa), Kagayaki 29 (Takadagawa), Kazuma 8865 (Kise), Ryuden 15 (Takadagawa), Shonannoumi 49 (Takadagawa), Tanji 287 (Arashio), Midorifuji 34 (Isegahama), Mitakeumi 26 (Dewanoumi), Enho 62 (Isegahama), Tomokaze 102 (Nakamura), Asahifuji 9103 (Isegahama), Meisei 38 (Tatsunami), Hatsuyama 77 (Tamanoi), Onokatsu 8853 (Onomatsu), Tobizaru 21 (Oitekaze), Shodai 33 (Tokitsukaze), Kayo 142 (Nakamura), Wakatakakage 12 (Arashio), Nabatame 117 (Futagoyama), Hitoshi 111 (Oitekaze), Tohakuryu 54 (Tamanoi), Shirokuma 98 (Nishonoseki), Wakanosho 195 (Minatogawa), Sadanoumi 35 (Sakaigawa), Tamashoho 101 (Kataonami), Tokifudo 140 (Tokitsukaze), Ryuho 9099 (Otowayama)
**Makushita (120):** Inami 8860 (Onoe), Nishikigi 16 (Isenoumi), Gojinyu 88 (Takekuma), Fujitensei 9050 (Fujishima), Fudoho 9115 (Tokitsukaze), Tsushimanada 58 (Sakaigawa), Ryusho 9097 (Oitekaze), Okaryu 8868 (Tatsunami), Mita 8856 (Futagoyama), Wakamiyabi 212 (Futagoyama), Omori 9135 (Oitekaze), Fujisodai 8874 (Fujishima), Hokutenkai 93 (Onoe), Toshunryu 251 (Tamanoi), Koseiryu 9059 (Otowayama), Kotokuzan 70 (Arashio), Nihonyanagi 145 (Onomatsu), Daiyusho 263 (Oitekaze), Mikazuchiyama 220 (Shikoroyama), Anhibiki 8876 (Ajigawa), Shimanoumi 65 (Kise), Yumenofuji 8905 (Isegahama), Ikazuchido 382 (Ikazuchi), Yonezawaryu 8928 (Sakaigawa), Tatsubayama 9100 (Tokitsukaze), Hananofuji 84 (Isegahama), Asanoryu 170 (Takasago), Aratakayama 224 (Minatogawa), Hananoumi 197 (Nishonoseki), Oshoryu 194 (Naruto), Oyamada 230 (Naruto), Kaigo 293 (Asakayama), Ryuji 8877 (Onomatsu), Takakento 63 (Minatogawa), Awanokuni 176 (Takadagawa), Mineyaiba 75 (Shikoroyama), Shoryu 8904 (Otowayama), Kiyota 215 (Dewanoumi), Tenrosei 9039 (Shikoroyama), Kakueizan 9086 (Otowayama), Ikawasakura 118 (Nakamura), Daimasakari 8869 (Oitekaze), Tokunomusashi 113 (Musashigawa), Hakugetsuro 9121 (Asahiyama), Kaisho 69 (Asakayama), Hinataryu 181 (Musashigawa), Kaiseijo 179 (Asakayama), Yamato 376 (Dewanoumi), Kototsubasa 172 (Sadogatake), Asonoyama 188 (Sakaigawa), Ohata 155 (Tokitsukaze), Asagyokusei 97 (Takasago), Tendozan 200 (Fujishima), Gonosho 8943 (Takekuma), Tokitenran 8861 (Tokitsukaze), Hogasho 292 (Tokitsukaze), Hamanoumi 280 (Tokitsukaze), Goseizan 8852 (Takekuma), Hakuonada 286 (Yamahibiki), Gonoumi 613 (Takekuma), Tenshoyama 9104 (Tamanoi), Ikarigata 8951 (Isenoumi), Tochitaikai 81 (Kasugano), Mudoho 91 (Otake), Nishinoryu 89 (Sakaigawa), Daikisho 159 (Oitekaze), Tochikodai 166 (Kasugano), Himukamaru 611 (Kise), Otsuji 167 (Takadagawa), Sazanami 219 (Isenoumi), Osanai 120 (Takasago), Haruyama 8862 (Onoe), Gyotoku 9084 (Tamanoi), Nobehara 152 (Futagoyama), Hanahibiki 9085 (Sakaigawa), Daikosho 8867 (Oitekaze), Kurohimeyama 100 (Sakaigawa), Obara 242 (Asakayama), Kitadaichi 141 (Tatsunami), Tochimusashi 72 (Kasugano), Tochimaru 107 (Kasugano), Kyokumizuno 467 (Oshima), Kobayashi 612 (Kasugano), Gyokuozan 274 (Naruto), Akua 73 (Tatsunami), Shimazuumi 57 (Hanaregoma), Shosei 9109 (Nakamura), Anosho 8863 (Ajigawa), Kamito 165 (Tatsunami), Kaki 9088 (Oitekaze), Nishiomoto 267 (Nakamura), Takahara 9098 (Futagoyama), Toseiryu 131 (Tamanoi), Ienoshima 209 (Yamahibiki), Mienofuji 85 (Isegahama), Shiroma 8864 (Onoe), Honoikazuchi 9136 (Ikazuchi), Kaishin 180 (Tagonoura), Kitaharima 124 (Yamahibiki), Uzumasa 8892 (Isenoumi), Seigo 210 (Shikoroyama), Oshoumi 95 (Naruto), Daishinkai 217 (Otake), Yoshiyasu 137 (Kise), Oyamatoumi 175 (Yamahibiki), Ieshima 300 (Yamahibiki), Inanoyama 8882 (Nishonoseki), Tsurubayashi 125 (Kise), Chiyotora 185 (Kokonoe), Hakuyozan 59 (Takadagawa), Marusho 355 (Naruto), Dewataikai 154 (Dewanoumi), Akiyoshi 281 (Onomatsu), Asakoki 128 (Takasago), Seiyu 8902 (Hidenoyama), Tochiseiryu 136 (Kasugano), Kazeeidai 586 (Oshiogawa), Kawamura 290 (Naruto), Hamayutaka 190 (Tokitsukaze), Izumifuji 557 (Isegahama)
