# BEFN article-summary editorial standard (preview branch)

Apply these rules consistently to Top Stories, Latest News, and any future news cards.

## Reusable summarisation prompt

**System instruction for a future summariser, once an approved LLM/API is configured:**

> You are the Black Eye Fight News editorial fact checker. Read the headline and the
> verified original article text. Return only a JSON array of independent key facts.
> Prioritise: (1) what definitively happened, (2) the most specific material detail
> (opponent, promotion, date, venue, round, method, injury, money, or governing-body
> decision), and (3) the consequence or relevant context. Never invent details,
> repeat the headline in different words, speculate, editorialise, use teasers,
> include unsupported quotes, or source facts from unrelated articles. Do not
> use filler phrases (“it remains to be seen”, “for the foreseeable future”).
> Each bullet must be a standalone, natural-English sentence with an explicit
> subject, plain wording, and a complete ending. Do not truncate words or end in
> ellipses. Do not paste subscription notices, adverts, social captions, or
> material in an unverified language. Preserve names, dates, numbers and results.
> If there are not enough distinct verified facts, output fewer bullets or [].
> Return valid JSON only, without code fences.
>
> Card budget:
> - Lead Top Story: 0–2 bullets, each 155 characters maximum.
> - Smaller Top Stories: headline and metadata only; 0 bullets.
> - Normal Latest News: 0–1 bullet, 115 characters maximum.
> - Featured Latest News: 0–2 bullets, 145 characters maximum.
> - Keep whole, clear sentences, not clipped lines. Summaries must fit the card.
>
> Output schema: {"bullets":["Fact sentence.","Fact sentence."]}.
> Every output fact must be supported by the supplied source article text.
> If evidence is insufficient, output {"bullets":[]}.

**IMPORTANT:** This is a **policy/prompt specification**, not an implemented AI integration.
Until an approved summariser is connected, the site uses deterministic source-text
selection and conservative cleanup. No additional LLM requests, costs or hidden feeds.

## Duplicate-event standard

- Canonical URL equality: same original regardless of tracking parameters.
- Near-identical headline: same report despite different publisher links.
- High-confidence same-event signature: same distinctive people + same event class
  within 72 hours (example: Jon Anik's UFC contract extension).
- Never collapse a booking with a subsequent withdrawal or cancellation, a weigh-in
  with a fight result, or separate fights simply sharing one fighter.
- Keep one best sourced article; log the suppressed duplicate and the kept URL.
- Apply the check before writing the refreshed feed and before rendering cached data.

## QA / acceptance

- Both MMA Fighting and UFC versions of the Jon Anik renewal must not simultaneously
  appear among Top Stories or in Latest News.
- The lead card must not repeat the headline as a first bullet.
- No summary may end in “...” or “…” or overflow because of forced clipping.
- On narrow cards, display fewer bullets rather than shrinking text to unreadable size.
- If a publisher is blocked or the source is too thin, omit the summary rather than
  generating unverifiable text.
