/* BEFN: supplementary sourced fight stats and verified upcoming records.
   Existing posters, flags, event layouts, tabs and editorial results remain untouched. */
(function () {
  "use strict";
  let index = null, loading = false, lastAttempt = 0, scheduled = false;
  const norm = x => String(x || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");
  const esc = x => String(x == null ? "" : x).replace(/[&<>"']/g,
    c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const css = document.createElement("style");
  css.textContent = [
    ".befn-cal-stats{margin:7px 9px 11px;border:1px solid #d9d0c2;background:#fffcf6;border-radius:5px;max-width:100%;overflow:hidden}",
    ".befn-cal-stats summary{cursor:pointer;padding:9px 11px;color:#403527;font-size:12px;font-weight:800;letter-spacing:.01em;list-style-position:inside}",
    ".befn-cal-stats[open] summary{border-bottom:1px solid #e7dfd2}",
    ".befn-cal-table{display:grid;gap:0;padding:5px 10px 9px;overflow-x:auto}",
    ".befn-cal-row{display:grid;grid-template-columns:34px minmax(0,1fr) minmax(0,1fr);align-items:baseline;gap:7px;padding:5px 0;border-bottom:1px solid #ece6dd}",
    ".befn-cal-row:last-child{border-bottom:none}",
    ".befn-cal-row span{font-size:11px;color:#414346;min-width:0;overflow-wrap:anywhere;line-height:1.35}",
    ".befn-cal-row b{font-size:11px;color:#63352d}",
    ".befn-cal-sub{font-size:10px!important;color:#64615b!important}",
    ".befn-cal-record-context{display:block;font-size:10px;color:#655e53;font-weight:500}",
    ".befn-cal-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:10px}",
    ".befn-cal-form-person{min-width:0;font-size:11px;color:#393a3a}",
    ".befn-cal-form-person strong{display:block;margin-bottom:4px}",
    ".befn-cal-form-line{font-size:11px;line-height:1.5;padding:3px 0;border-top:1px solid #ece6dc}",
    ".befn-cal-form-line b{color:#7e332c;margin-right:4px}",
    ".befn-cal-form-line span{display:block;font-size:10px;color:#68645f}",
    "@media(max-width:520px){.befn-cal-form-grid{grid-template-columns:1fr}}",
    ".befn-cal-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}",
    "@media(max-width:520px){.befn-cal-stats{margin:7px 3px 9px}.befn-cal-row{grid-template-columns:26px minmax(0,1fr) minmax(0,1fr);gap:5px}.befn-cal-row span{font-size:10px}}"
  ].join("");
  document.head.appendChild(css);
  function pair(a,b) { return [norm(a),norm(b)].sort().join(":"); }
  function boutsFor(event) {
    return Array.isArray(event?.bouts) ? event.bouts : [];
  }
  function currentNames(article) {
    const rows = [...article.querySelectorAll(".result-contender-info strong")];
    if (rows.length !== 2) return null;
    const names = rows.map(x => [...x.childNodes].filter(node => node.nodeType === 3)
      .map(node => node.textContent).join(" ").trim() || x.textContent.trim());
    return names.every(Boolean) ? names : null;
  }
  function findEvent(details, events) {
    const heading = details.querySelector(".befn-result-summary-copy strong, .upcoming-hero-title");
    const title = norm(heading?.textContent);
    const candidates = events.filter(e => {
      const theirs = norm(e.title);
      return title && theirs && (title === theirs || (title.length > 12 && theirs.length > 12 &&
        (title.includes(theirs) || theirs.includes(title))));
    });
    if (candidates.length === 1) return candidates[0];
    // Strict two-athlete identity matching, rather than guessing from event titles.
    const first = details.querySelector("article.result-bout");
    const names = first && currentNames(first);
    if (!names) return null;
    const found = events.filter(e => boutsFor(e).some(b => pair(b.a,b.b)===pair(...names)));
    return found.length === 1 ? found[0] : null;
  }
  function value(v) { return Number.isInteger(v) ? String(v) : "—"; }
  function count(landed, attempted) {
    return value(landed) + (Number.isInteger(attempted) ? "/" + attempted : "");
  }
  function timed(n) {
    if (!Number.isInteger(n)) return "—";
    return Math.floor(n/60)+":"+String(n%60).padStart(2,"0");
  }
  function line(r, corner) {
    const x = r[corner] || {};
    return "<span>Sig " + count(x.sigLanded,x.sigAttempted) +
      " · TD " + count(x.takedowns,x.takedownAttempts) +
      " · Ctrl " + timed(x.controlSec) +
      (Number.isInteger(x.knockdowns) && x.knockdowns>0 ? " · KD " + x.knockdowns : "") + "</span>";
  }
  function addRounds(article, bout) {
    if (article.querySelector(".befn-cal-stats") || !Array.isArray(bout.roundPreview) ||
        !bout.roundPreview.length || !article.classList.contains("is-completed")) return;
    const section = document.createElement("details");
    section.className = "befn-cal-stats";
    const head = "<div class='befn-cal-row'><b></b><span><strong>"+
      esc(bout.a)+"</strong></span><span><strong>"+esc(bout.b)+"</strong></span></div>";
    const rows = bout.roundPreview.map(r => "<div class='befn-cal-row'><b>R"+
      esc(r.round)+"</b>"+line(r,"a")+line(r,"b")+"</div>").join("");
    section.innerHTML = "<summary>Round statistics</summary><div class='befn-cal-table'>" +
      head + rows + "</div><p class='befn-cal-sub' style='margin:0 10px 9px'>Sig = significant strikes landed/attempted; TD = takedowns; Ctrl = control time. — means unavailable.</p>";
    article.appendChild(section);
  }
  function addUpcomingRecords(article, bout, names) {
    if (!article.classList.contains("upcoming-bout")) return;
    const sides = [...article.querySelectorAll(".result-contender")];
    sides.forEach((side,i) => {
      const match = norm(names[i]) === norm(bout.a) ? "a" :
                    norm(names[i]) === norm(bout.b) ? "b" : null;
      if (!match) return;
      const record = bout[match+"Record"];
      if (typeof record !== "string" || !/^\d{1,3}-\d{1,3}(?:-\d{1,3})?$/.test(record)) return;
      const existing = side.querySelector(".upcoming-fighter-record");
      if (!existing || !existing.classList.contains("is-unverified")) return;
      existing.classList.remove("is-unverified");
      existing.textContent = record;
      existing.title = "Current recorded professional MMA record; not a historical pre-fight record";
      const sourceNote = document.createElement("span");
      sourceNote.className="befn-cal-record-context";
      sourceNote.textContent="Current career record";
      existing.insertAdjacentElement("afterend",sourceNote);
    });
  }
  function addScorecards(article, bout) {
    if (article.querySelector(".befn-cal-judges") ||
        !article.classList.contains("is-completed")) return;
    const sc=bout.scorecardSummary;
    if (!sc || !Array.isArray(sc.judges) || !sc.judges.length) return;
    const known=sc.judges.filter(x=>x.scoresKnown && Number.isInteger(x.totalA)
      && Number.isInteger(x.totalB));
    if (!known.length) return;
    const block=document.createElement("details");
    block.className="befn-cal-stats befn-cal-judges";
    const rows=known.map(j=>"<div class='befn-cal-row'><b>Judge</b><span>"+
      esc(j.judge || "Official judge")+"</span><span><strong>"+esc(j.totalA)+"–"+
      esc(j.totalB)+"</strong></span></div>").join("");
    block.innerHTML="<summary>Official judges’ scorecards</summary>"+
      "<div class='befn-cal-table'>"+rows+"</div>";
    article.appendChild(block);
  }
  function addUpcomingForm(article,bout) {
    if (window.BEFNFighterInsights) return;
    if (!article.classList.contains("upcoming-bout") ||
        article.querySelector(".befn-cal-form")) return;
    const recent=["a","b"].filter(c=>Array.isArray(bout[c+"Recent"]) &&
       bout[c+"Recent"].length);
    const champion= ["a","b"].filter(c=>bout[c+"HeldUfcTitle"]===true);
    if (!recent.length && !champion.length) return;
    const panel=document.createElement("details");
    panel.className="befn-cal-stats befn-cal-form";
    const parts=["a","b"].map(c=>{
      const history=(bout[c+"Recent"]||[]).slice(0,3);
      const label=c==="a"?bout.a:bout.b;
      const title= "<strong>"+esc(label)+"</strong>"+
        (bout[c+"HeldUfcTitle"]===true?" <small>· Has held a UFC title</small>":"");
      const rows=history.map(h=>
        "<div class='befn-cal-form-line'><b>"+esc(String(h.result||"").toUpperCase())+
        "</b> "+esc(h.opponent)+" <span>"+esc(h.date)+"</span></div>").join("");
      return "<div class='befn-cal-form-person'>"+title+rows+"</div>";
    }).join("");
    panel.innerHTML="<summary>Recent form &amp; championship history</summary>"+
      "<div class='befn-cal-form-grid'>"+parts+"</div>";
    article.appendChild(panel);
  }
  function apply() {
    if (!index) return;
    const all = Object.values(index.events || {}).filter(e => e && (e.org==="ufc"||e.org==="pfl"));
    document.querySelectorAll("details[data-result-event],details[data-upcoming-card]").forEach(detail => {
      if (!detail.open) return;
      const ev = findEvent(detail,all);
      if (!ev) return;
      detail.querySelectorAll("article.result-bout").forEach(article => {
        const names = currentNames(article);
        if (!names) return;
        const matching = boutsFor(ev).filter(b => pair(b.a,b.b) === pair(names[0],names[1]));
        if (matching.length !== 1) return;
        const bout = matching[0];
        addRounds(article,bout);
        addScorecards(article,bout);
        addUpcomingRecords(article,bout,names);
        addUpcomingForm(article,bout);
      });
    });
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {scheduled=false;apply();});
  }
  function load() {
    if (loading || index || Date.now()-lastAttempt<30000) return;
    loading=true;
    lastAttempt=Date.now();
    fetch("data/ufcalendar-card-enhancements.json",{cache:"no-store"})
      .then(r => { if (!r.ok) throw Error("UFCalendar feed unavailable");return r.json();})
      .then(data => { if (data && data.schema===1 && data.events &&
                      typeof data.events==="object") { index=data; schedule(); }})
      .catch(()=>{}).finally(()=>{loading=false;});
  }
  const root=document.getElementById("main")||document.body;
  if (root) new MutationObserver(schedule).observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:["open"]});
  document.addEventListener("click",e=>{if(e.target.closest?.("details[data-result-event],details[data-upcoming-card]")) schedule();});
  window.addEventListener("hashchange",()=>{load();schedule();});
  load();
})();
