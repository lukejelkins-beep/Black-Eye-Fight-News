/* BEFN Fighter Scout: additive evidence panel, no changes to existing fighter records. */
(function () {
  "use strict";
  let snapshot = null, loading = false;
  const esc = value => String(value == null ? "" : value).replace(/&/g, "&amp;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  const style = document.createElement("style");
  style.textContent = ".befn-scout-intel{background:#fffaf1;color:#202226;border:1px solid #d9cfbf;border-top:3px solid #a8211c;border-radius:4px;padding:17px;margin:18px 0 23px;max-width:100%;overflow:hidden}.befn-scout-intel h3{font:900 clamp(20px,3vw,27px)/1.1 'Barlow Condensed',Impact,sans-serif;margin:0;text-transform:uppercase;letter-spacing:.03em}.befn-scout-intel p{color:#5d5e61;line-height:1.5;margin:8px 0 14px;font-size:12px}.befn-scout-intel-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.befn-scout-item{padding:12px;background:#fff;border:1px solid #e5dfd4;min-width:0}.befn-scout-item b{display:block;font-size:14px;line-height:1.3;overflow-wrap:anywhere}.befn-scout-item small{display:block;color:#596168;font-size:11px;line-height:1.4;margin:6px 0}.befn-scout-item p{font-size:12px;color:#2e343a;margin:5px 0}.befn-scout-item a{font-size:11px;color:#94302a;text-decoration:underline}.befn-scout-priority{color:#9f2720;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.02em}@media(max-width:780px){.befn-scout-intel-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:470px){.befn-scout-intel{padding:12px}.befn-scout-intel-grid{grid-template-columns:1fr}}";
  document.head.appendChild(style);
  function render() {
    if (location.hash !== "#fighters" || !snapshot || !Array.isArray(snapshot.fighters)) return;
    const list = snapshot.fighters.filter(x => x && (x.reviewPriority === "high" || x.reviewPriority === "medium")).slice(0, 6);
    if (!list.length || document.getElementById("befn-scout-intelligence")) return;
    const grid = document.getElementById("fighterGrid");
    if (!grid || !grid.parentNode) return;
    const panel = document.createElement("section");
    panel.id = "befn-scout-intelligence";
    panel.className = "befn-scout-intel";
    panel.setAttribute("aria-label", "Fighter reassessment evidence");
    const rows = list.map(f => {
      const last = f.lastFight || {}, recent = f.recent || {};
      const href = typeof last.source === "string" && /^https:\/\//.test(last.source) ?
        '<a href="' + esc(last.source) + '" target="_blank" rel="noopener noreferrer">Fight result source</a>' : "";
      const details = Array.isArray(f.signals) ? f.signals.slice(0, 2).map(s =>
        '<p>' + esc(s) + '</p>').join("") : "";
      return '<article class="befn-scout-item"><b>' + esc(f.name) + '</b><small>' +
        esc(f.organisation) + ' · ' + esc(f.division || "Division unconfirmed") + ' · ' +
        esc(recent.wins) + 'W–' + esc(recent.losses) + 'L in sourced bouts</small>' +
        '<span class="befn-scout-priority">' + esc(f.reviewPriority) +
        ' review priority</span>' + details + href + '</article>';
    }).join("");
    panel.innerHTML = '<h3>Scouting intelligence · review queue</h3><p>' +
      'Evidence to support weekly prospect and contender reassessments, not automatic labels. ' +
      'Reviewed ' + esc(snapshot.generatedOn || "date unavailable") + '.</p>' +
      '<div class="befn-scout-intel-grid">' + rows + '</div>';
    grid.parentNode.insertBefore(panel, grid);
  }
  function load() {
    if (loading || snapshot) return;
    loading = true;
    fetch("data/fighter-intelligence.json", {cache:"no-store"})
      .then(response => { if (!response.ok) throw new Error("No intelligence snapshot"); return response.json(); })
      .then(payload => { if (payload && payload.schema === 1) {snapshot = payload; render();} })
      .catch(() => {}).finally(() => {loading = false;});
  }
  const main = document.getElementById("main");
  if (main) new MutationObserver(render).observe(main, {childList:true, subtree:true});
  window.addEventListener("hashchange", () => {
    if (location.hash === "#fighters") { load(); setTimeout(render, 0); }
  });
  if (location.hash === "#fighters") load();
})();
