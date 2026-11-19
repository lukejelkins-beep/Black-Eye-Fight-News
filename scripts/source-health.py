"""Owner report: how healthy each news and social source is. Read-only.

Reads the saved data files only (no network, no keys) and prints Markdown.
Run: python3 scripts/source-health.py [--now ISO] [--data DIR]
"""
import argparse, collections, datetime as dt, json, sys
from pathlib import Path

UTC = dt.timezone.utc
STALE_DAYS = 7
SILENT_DAYS = 30


def parse(value):
    try:
        return dt.datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(UTC)
    except (ValueError, TypeError, AttributeError):
        return None


def load(data, name):
    path = Path(data) / name
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def cell(text):
    return str(text).replace("|", "/").replace("\n", " ")


def age_text(then, now):
    if not then:
        return "never"
    hours = (now - then).total_seconds() / 3600
    if hours < 1:
        return f"{int(hours * 60)} min ago"
    if hours < 48:
        return f"{int(hours)} h ago"
    return f"{int(hours // 24)} days ago"


def news_rows(news, now):
    by_source = collections.defaultdict(list)
    for article in news.get("articles", []) + news.get("resultReports", []):
        by_source[article.get("source")].append(article)
    rows = []
    for source in news.get("sources", []):
        items = by_source.get(source.get("name"), [])
        dates = [d for d in (parse(a.get("publishedAt")) for a in items) if d]
        newest = max(dates) if dates else None
        week = sum(1 for d in dates if (now - d).days < 7)
        with_image = sum(1 for a in items if (a.get("image") or {}).get("url"))
        flags = []
        if not source.get("ok"):
            flags.append("feed failed: " + str(source.get("error", "unknown"))[:60])
        if newest is None:
            flags.append("no stories held")
        elif (now - newest).days >= SILENT_DAYS:
            flags.append(f"silent {SILENT_DAYS}+ days: retire or replace")
        elif (now - newest).days >= STALE_DAYS:
            flags.append(f"no story for {(now - newest).days} days")
        if "bing.com/news" in str(source.get("feedUrl", "")):
            flags.append("Bing search feed: find an official feed")
        if items and with_image == 0:
            flags.append("no photos in feed")
        rows.append({
            "name": source.get("name"), "sport": source.get("sport"),
            "ok": bool(source.get("ok")), "held": len(items), "week": week,
            "photos": f"{with_image}/{len(items)}", "newest": age_text(newest, now),
            "lastOk": age_text(parse(source.get("lastSuccessfulAt")), now),
            "flags": flags,
        })
    return rows


def social_rows(talk, now, xcache=None):
    by_platform = collections.defaultdict(list)
    for post in talk.get("posts", []) + (xcache or {}).get("posts", []):
        d = parse(post.get("postedAt"))
        if d:
            by_platform[post.get("platform")].append(d)
    status = {s.get("platform"): s for s in talk.get("platformStatus", [])}
    rows = []
    for platform in sorted(set(by_platform) | set(status)):
        dates = by_platform.get(platform, [])
        newest = max(dates) if dates else None
        flags = []
        st = status.get(platform, {})
        if st.get("state") in ("unavailable", "failed"):
            flags.append("not readable: " + str(st.get("message", ""))[:80])
        if dates and (now - newest).days >= STALE_DAYS:
            flags.append(f"newest post is {(now - newest).days} days old; hidden from Live")
        rows.append({
            "platform": platform, "state": st.get("state", "has posts"),
            "posts": len(dates), "day": sum(1 for d in dates if (now - d).total_seconds() < 86400),
            "week": sum(1 for d in dates if (now - d).days < 7),
            "newest": age_text(newest, now), "configured": st.get("configured"),
            "checked": st.get("checked"), "flags": flags,
        })
    return rows


def render(data, now):
    news = load(data, "news-live.json")
    talk = load(data, "fight-talk-live.json")
    xcache = load(data, "fight-talk-x-api.json")
    xbudget = load(data, "fight-talk-x-budget.json")
    embedded = load(data, "fight-talk-embedded.json")
    out = [f"# Source health, {now:%d %b %Y %H:%M} UTC", ""]
    out += ["## News feeds", "", f"Last full check: {age_text(parse(news.get('lastSuccessfulAt')), now)}. "
            f"{len(news.get('articles', []))} stories and {len(news.get('resultReports', []))} result reports held.", "",
            "| Source | Sport | OK | Held | 7 days | Photos | Newest | Last OK | Flags |", "|---|---|---|---|---|---|---|---|---|"]
    rows = news_rows(news, now)
    for r in rows:
        out.append(f"| {r['name']} | {r['sport']} | {'yes' if r['ok'] else 'NO'} | {r['held']} | {r['week']} | "
                   f"{r['photos']} | {r['newest']} | {r['lastOk']} | {cell('; '.join(r['flags'])) or '-'} |")
    out += ["", "## Fight Talk platforms", "",
            "| Platform | State | Posts held | Last 24 h | Last 7 days | Newest | Accounts checked | Flags |", "|---|---|---|---|---|---|---|---|"]
    for r in social_rows(talk, now, xcache):
        checked = "-" if r["checked"] is None else f"{r['checked']} of {r['configured']}"
        out.append(f"| {r['platform']} | {r['state']} | {r['posts']} | {r['day']} | {r['week']} | {r['newest']} | {checked} | {cell('; '.join(r['flags'])) or '-'} |")
    out += ["", "## Paid X collector", ""]
    if xbudget:
        used = xbudget.get("verifiedEstimateMicroUsd", 0) / 1e6
        out.append(f"{xbudget.get('month')}: {xbudget.get('completed')} of {xbudget.get('attempts')} calls completed, about US${used:.2f} used (ledger cap US$1.80). "
                   f"Last call {age_text(parse(xbudget.get('lastCompletedAt')), now)}. {'PAUSED.' if xbudget.get('paused') else 'Running.'}")
    else:
        out.append("No ledger found.")
    out += ["", "## Publisher embed discovery", ""]
    if embedded:
        out.append(f"Last run checked {embedded.get('publisherFeedsChecked')} of {embedded.get('publisherSourcesConfigured')} publisher feeds, "
                   f"found {embedded.get('linksFound')} embeddable links, {embedded.get('newEmbedsVerified')} new embeds verified.")
    else:
        out.append("No embed data found.")
    flagged = sum(1 for r in rows if r["flags"])
    out += ["", f"News feeds with a flag: {flagged} of {len(rows)}.", ""]
    return "\n".join(out)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--now")
    ap.add_argument("--data", default="data")
    args = ap.parse_args(argv)
    now = parse(args.now) if args.now else dt.datetime.now(UTC)
    sys.stdout.write(render(args.data, now))


if __name__ == "__main__":
    main()
