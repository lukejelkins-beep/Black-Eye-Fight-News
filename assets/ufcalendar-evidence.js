/* Public derived evidence only: no API credentials, raw data feed or quota details. */
(function () {
  "use strict";
  let state = null, loading = false;
  const esc = x => String(x == null ? "" : x).replace(/&/g,"&amp;")
    .replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const style = document.createElement("style");
  style.textContent = ".befn-round-evidence{margin:16px 0 24px;padding:18px;border:1px solid #d6cbbc;border-left:4px solid #9e3029;background:#fff9f0;color:#222}.befn-round-evidence h3{font:900 clamp(18px,3vw,26px)/1.12 'Barlow Condensed',Impact,sans-serif;text-transform:uppercase;letter-spacing:.04em;margin:0 0 5px}.befn-round-evidence .befn-explain{font-size:12px;color:#576068;line-height:1.55;margin:0 0 13px}.befn-round-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.befn-round-card{background:#fff;border:1px solid #e1d9cd;padding:12px;min-width:0}.befn-round-card strong{font-size:14px;line-height:1.4;display:block;overflow-wrap:anywhere}.befn-round-meta{color:#676b6c;font-size:11px;line-height:1.5;margin:3px 0 8px}.befn-round-line{font-size:11px;line-height:1.6;padding:4px 0;border-top:1px solid #eee8e0;font-variant-numeric:tabular-nums}.befn-round-line b{font-weight:800}.befn-round-nodata{color:#676b6c}.befn-round-source{font-size:10px;color:#676b6c;margin-top:8px}@media(max-width:650px){.befn-round-evidence{padding:12px}.befn-round-grid{grid-template-columns:1fr}}";
  document.head.appendChild(style);
  function number(value) { return typeof value === "number" ? String(value) : "—"; }
  function draw() {
    if (location.hash !== "#fighters" || !state || !state.fights) return;
    const list = Object.values(state.fights).filter(x => x && Array.isArray(x.rounds) && x.rounds.length);
    if (!list.length || document.getElementById("befn-round-evidence")) return;
    const grid = document.getElementById("fighterGrid");
    if (!grid || !grid.parentNode) return;
    list.sort((a,b) => String(b.date).localeCompare(String(a.date)));
    const section = document.createElement("section");
    section.className = "befn-round-evidence";
    section.id = "befn-round-evidence";
    section.setAttribute("aria-label","Source-linked round-by-round fight statistics");
    const cards = list.slice(0,4).map(f => {
      const names = esc(f.fighterA && f.fighterA.name) + " vs " + esc(f.fighterB && f.fighterB.name);
      const lines = f.rounds.slice(0,5).map(r => {
        const a = r.a || {}, b = r.b || {};
        return '<div class="befn-round-line"><b>R' + esc(r.round) + '</b> · Significant strikes ' +
          number(a.sigLanded) + '–' + number(b.sigLanded) +
          ' · Takedowns ' + number(a.takedowns) + '–' + number(b.takedowns) +
          ' · Control ' + number(a.controlSec) + 's / ' + number(b.controlSec) + 's</div>';
      }).join("");
      return '<article class="befn-round-card"><strong>' + names + '</strong>' +
        '<div class="befn-round-meta">' + esc(f.event || "") + ' · ' +
        esc(f.date || "") + ' · ' + esc(f.division || "MMA") + '</div>' +
        lines + '<div class="befn-round-source">Source: ' + esc(f.sourceNames || 'UFCalendar') + ' · Strikes are listed A–B, not judges’ scores · — means unavailable</div></article>';
    }).join("");
    section.innerHTML = '<h3>Round-by-round intelligence</h3><p class="befn-explain">' +
      'Selected fight evidence for scouting reviews. ' + list.length +
      ' bouts analysed so far; statistics are displayed where officially available. ' +
      'Fight outcomes and classifications are reviewed separately.</p>' +
      '<div class="befn-round-grid">' + cards + '</div>';
    grid.parentNode.insertBefore(section,grid);
  }
  function transformArchive(payload) {
    if (!payload || payload.schema !== 1 || !payload.fights) return null;
    const fights = {};
    Object.entries(payload.fights).forEach(([id,f]) => {
      if (!f || !Array.isArray(f.rounds) || !f.rounds.length) return;
      fights[id] = {
        date: f.date, event: f.event, division: f.division || "UFC",
        fighterA: {name: f.fighterA}, fighterB: {name: f.fighterB},
        sourceNames: Object.keys(f.sources || {}).map(x => x === "cito" ? "Cito" :
          x === "ufcalendar" ? "UFCalendar" : "UFC Stats API").join(" + "),
        rounds: f.rounds
      };
    });
    return {schema:1, fights};
  }
  function load() {
    if (state || loading) return;
    loading = true;
    fetch("data/ufc-research-archive.json", {cache:"no-store"})
      .then(r => {if (!r.ok) throw Error("Archive not ready"); return r.json();})
      .then(data => {
        state = transformArchive(data);
        if (!state || !Object.keys(state.fights).length) throw Error("No archive evidence yet");
        draw();
      })
      .catch(() => fetch("data/ufcalendar-intelligence.json", {cache:"no-store"})
        .then(r => {if(!r.ok) throw Error("No fallback evidence"); return r.json();})
        .then(data => {if (data && data.schema===1) {state=data;draw();}})
        .catch(() => {}))
      .finally(() => {loading = false;});
  }
  const main = document.getElementById("main");
  if(main) new MutationObserver(draw).observe(main,{childList:true,subtree:true});
  window.addEventListener("hashchange", () => {if(location.hash==="#fighters"){load();setTimeout(draw,0);}});
  if(location.hash==="#fighters") load();
})();
