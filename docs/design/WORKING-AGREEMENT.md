# Working agreement

## Roles
- **Owner (Luke):** sets taste and priorities, approves every production merge and release, supplies rights decisions and the image stockpile.
- **Claude:** reviews, designs, builds, tests and verifies on the real preview. Proposes before changing direction. Reports what it did not check.
- **Other tools (ChatGPT/Codex):** may contribute, but follow these files and `AGENTS.md`.

## How a change moves
1. **Propose** in one or two sentences, with a mock or screenshot when the change is visual.
2. **Build** on a short-lived branch from the right base (Sumo work targets the Sumo preview branch; everything else targets `main`).
3. **Check** with the affected tests and a real-browser look at phone (390 px) and desktop (1280 px).
4. **Open a PR** with what changed, how it was verified, and what was not covered.
5. **Owner approves** by saying "Merge N". Nothing reaches `main` or production without that.
6. **Deploy and verify** on the live URL, then record the decision in DECISIONS.md.

## Preview and production
- Visual experiments go to a preview service first. `main` auto-deploys to production, so unapproved work never lands there.
- The Sumo preview refreshes itself every 30 minutes during a basho (scheduler on `main`, logic on the preview branch) and redeploys through a Render deploy hook.

## Definition of done (visual work)
- One `h1`, the shared page header, the shared navigation.
- No horizontal scroll at 375 px; tap targets at least 44 px; text at least 12 px.
- Every image has a source and rights status; none is stretched or letterboxed.
- Checked in a real browser, not only in tests. Screenshots in the PR.
- Existing tests still pass; any pre-existing failures are named, not hidden.

## Using Claude Design
Use it for one or two key screens when the layout is a real choice (for example three options for the result rows). Do not use it for every page: the real site is code, so an approved mock still has to be built.

## Standing rules
- Keep UFC, boxing, sumo and QA work in separate branches and PRs.
- Never expose secrets. The newsletter repo stays private and paused.
- State plainly when something was not tested or could not be checked.
