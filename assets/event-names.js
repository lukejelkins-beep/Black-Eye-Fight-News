/* BEFN event names: drop title-sponsor prefixes from event and video titles
 * ("Polymarket UFC 334: Gane vs Hokit" -> "UFC 334: Gane vs Hokit").
 * Display only: source data and links are untouched. News headlines and
 * social posts are publishers' own words and are not passed through this.
 * Add a sponsor to TITLE_SPONSORS when a new one appears in event names. */
(function(scope){
 "use strict";
 const TITLE_SPONSORS=["Polymarket"];
 const words=TITLE_SPONSORS.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");
 // "<Sponsor> UFC ...", "<Sponsor> #UFC334" and "... presented by <Sponsor>".
 const leading=new RegExp("\\b(?:"+words+")\\s+(?=#?UFC\\b|#?UFC\\d)","gi");
 const presented=new RegExp("\\s*(?:,\\s*)?(?:presented|powered)\\s+by\\s+(?:"+words+")\\b","gi");
 function eventTitle(text){
  if(text==null)return text;
  return String(text).replace(leading,"").replace(presented,"").replace(/\s{2,}/g," ").trim();
 }
 const api={eventTitle,TITLE_SPONSORS};
 scope.BEFNEventTitle=eventTitle;
 scope.BEFNEventNames=api;
 if(typeof module==="object"&&module?.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
