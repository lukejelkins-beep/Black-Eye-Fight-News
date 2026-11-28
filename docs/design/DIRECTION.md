# Design direction

Status: approved 2026-11-17, updated 2026-11-22 to the owner's most recent choices (landing page design D, Unbounded headings, light surfaces), and **confirmed by the owner on 2026-11-22**: shown design D and #378's charcoal preview side by side at 390 px, the owner answered "Design D". Where an earlier rule and a newer owner decision disagree, the newer decision wins. Changes to this direction need the owner's agreement and a line in DECISIONS.md.

**Implemented on `main` today:** light profiles, Fights, Fighters and stats pages (cream, white cards, Barlow headings). **Not on `main` yet:** Unbounded, the cream landing page (#382) and the site-wide theme (branch `feat/site-style-20261122`). News is still dark on `main`; the owner has asked for the landing page's colour and font site-wide, so it moves to light with that change.

## The feel
Modern, fast and confident, in the spirit of the official UFC site: big photography, one accent colour, almost no decoration. Page surfaces are light (cream with white cards); the top bar, sport row, posters and photo leads stay dark. The owner does not want a very dark scheme. A reader should find the thing they came for in one tap and understand it in one glance.

## Principles
1. **Photography leads.** Every important card has a clear, well-cropped, consistently framed image. No image is better than a bad one.
2. **One idea per screen section.** No stacked banners, no explanatory paragraphs where a label will do.
3. **Same pattern everywhere.** Every page opens with the same header (title, one context line; dark top bar with a red edge above it). Same card shapes, same spacing, same buttons.
4. **Scan, then dig.** Show result, score, record and status first. Detail sits one tap deeper.
5. **Phone first.** Design the 375 px screen first. Tap targets at least 44 px. No horizontal scroll. Nothing under 12 px.
6. **Reader content only.** Research queues, review priorities, verification notes and audit text are staff tools. They never lead a public page.
7. **Fast.** Images sized to their slot and lazy-loaded. No page loads data it does not show.

## Tokens (current)
- **Blood and steel** (owner, 28 Nov 2026; replaces red/gold/cream): Blood red `#b3001b` (accent, active states; darker `#8f0016`) · Steel `#c5ccd3` (secondary highlight, where gold was) · Cool grey `#eef0f2` (page) · Gunmetal `#14181c` (text, dark bands) · Raised dark `#303437` (pills and chips on dark bands). Flags keep their real colours (Japan's red sun stays `#cf1824`). No warm creams, plums, browns or golds anywhere: neutrals are cool grey (hue 210).
- Headlines and big numbers: **Oswald** 600–700, sentence case (owner, 28 Nov 2026, "Blood and steel"; was Unbounded). Body and UI: **Inter** (was DM Sans). Two families only. **Barlow Condensed** is being phased out of headings: until the site-wide theme ships, existing pages keep it. Russo One is still imported in `index.html` and is probably unused; remove it once confirmed.
- Fighter names are plain text or a plain link: no photo pop-up and no dotted underline (owner, 28 Nov 2026).
- Sport colours: boxing red (the blood red `#b3001b`), MMA amber `#e0a400`, sumo blue `#2a4a8f`.
- Radius 8–12 px. One shadow level. Spacing in multiples of 4.

## Patterns
- **Page header:** dark top bar and sport row with a red edge; below it a light page head with the h1 and one grey context line. (Earlier rule: dark band with a 4 px red left edge and uppercase h1; applies until the site-wide theme ships.)
- **Home:** lead story, latest-result tile, this week and next, By sport columns (boxing, MMA, sumo), latest news, Fight Talk box (design D, #382; owner: "A structurally, B's font, C's sport columns", then "Love it").
- **Navigation (sport first, owner 23 Nov 2026; front page only, 28 Nov 2026):** the sport is the area you are in. The front page is the only all-sports page: every section (News, Fights, Fighters, Analysis, Fight Talk) belongs to a sport, and opening one from the front page uses the reader's last sport (MMA on a first visit), which the section row names. Desktop: the top bar lists the sports (Boxing, MMA, Sumo; red underline, amber for MMA, on the current one) and the logo opens the all-sports front page; the row below names the area and holds its five sections (Overview, Fights, Fighters, Analysis, Fight Talk). Phone (option B, owner 24 Nov 2026): one slim 52 px top bar holds "BEFN" (opens the front page), the Boxing / MMA / Sumo tabs and a menu icon. It slides away while scrolling down and comes back on any scroll up. The sections stay in the bottom tab bar, under the thumb, with the active tab marked in the sport's colour (red Boxing, amber MMA, blue Sumo). Alerts and Install live in the menu. Choosing a sport opens that sport's Overview. Grappling is left out of the navigation until it is ready (owner: a separate project). Sumo uses the same header with four sections (Overview, Fights, Fighters, Analysis; no Fight Talk until a source covers sumo), its pages in a pill row under the section they belong to. Sport choices are labelled text, never icon-only.
- **Result / matchup row:** compact. Two names, two small portraits, result or time, one line of context. Target five or more rows per phone screen.
- **Athlete profile:** dark hero band with photo faded into it, rank and status chips, uppercase name, record, three large stat numbers, "latest bout" panel, "full history" button.
- **Event card:** poster or key art as the image, headline bout as the title, date and local start time, venue.
- **Stats:** bars and big numbers, not strings of small text.

## We will not
- Add a third typeface beyond Oswald and Inter, image-based headings, chrome or bevel effects, or emoji/icon-only navigation.
- Show placeholder text to readers (for example "Start time TBC · venue date").
- Put internal research on public pages.
- Use an image without a recorded source and rights status (see IMAGE-GUIDE.md).

## Open questions for the owner
- ~~#378 (charcoal and ivory hero, Unbounded) is a draft from another chat; confirm it is not the direction.~~ **Settled 2026-11-22: it is not.** Design D is the direction; #378 stays a preview and ships nothing. Its dark charcoal palette can be revisited as a separate proposal if the owner wants it.
- Whether Unbounded replaces Barlow everywhere or only on the pages the owner names. This file assumes everywhere. The phone masthead is still Barlow Condensed (it sits in the dark top bar, which the site-wide theme does not restyle).

## Where the new look is tried first
Sumo, formerly the preview pilot for this direction, is live on `main` and is built and deployed there like every other sport (the separate preview site is retired, 23 Nov 2026). Patterns proven on Sumo are ported to the other pages one at a time.
