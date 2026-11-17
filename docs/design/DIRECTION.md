# Design direction

Status: **proposed by Claude on 2026-11-17, awaiting owner approval** unless marked *approved*. Approved items move to the top of DECISIONS.md.

## The feel
Modern, fast and confident, in the spirit of the official UFC site: dark editorial surfaces, big photography, uppercase condensed headlines, one accent colour, almost no decoration. A reader should find the thing they came for in one tap and understand it in one glance.

## Principles
1. **Photography leads.** Every important card has a clear, well-cropped, consistently framed image. No image is better than a bad one.
2. **One idea per screen section.** No stacked banners, no explanatory paragraphs where a label will do.
3. **Same pattern everywhere.** Every page opens with the same header (dark band, red edge, uppercase title, one context line). Same card shapes, same spacing, same buttons.
4. **Scan, then dig.** Show result, score, record and status first. Detail sits one tap deeper.
5. **Phone first.** Design the 375 px screen first. Tap targets at least 44 px. No horizontal scroll. Nothing under 12 px.
6. **Reader content only.** Research queues, review priorities, verification notes and audit text are staff tools. They never lead a public page.
7. **Fast.** Images sized to their slot and lazy-loaded. No page loads data it does not show.

## Tokens (current, from the Sumo preview)
- Red `#cf1824` (accent, active states) · Gold `#f3c332` (secondary highlight) · Cream `#f8f4ed` (page) · Ink `#111013` (text, dark bands) · Dark band `#151115`.
- Headlines: **Barlow Condensed** 800–900, uppercase. Body and UI: **DM Sans**. Two families only.
- Radius 8–12 px. One shadow level. Spacing in multiples of 4.

## Patterns
- **Page header:** dark band, 4 px red left edge, uppercase h1, one grey context line.
- **Navigation:** four to five primary items, same on phone and desktop, red underline on the active item. Sport filters are labelled text, never icon-only.
- **Result / matchup row:** compact. Two names, two small portraits, result or time, one line of context. Target five or more rows per phone screen.
- **Athlete profile:** dark hero band with photo faded into it, rank and status chips, uppercase name, record, three large stat numbers, "latest bout" panel, "full history" button.
- **Event card:** poster or key art as the image, headline bout as the title, date and local start time, venue.
- **Stats:** bars and big numbers, not strings of small text.

## We will not
- Add a third typeface, image-based headings, chrome or bevel effects, or emoji/icon-only navigation.
- Show placeholder text to readers (for example "Start time TBC · venue date").
- Put internal research on public pages.
- Use an image without a recorded source and rights status (see IMAGE-GUIDE.md).

## Where the new look is tried first
The Sumo preview (`befn-sumo-preview`) is the pilot for this direction. Patterns proven there are ported to the main site one page at a time.
