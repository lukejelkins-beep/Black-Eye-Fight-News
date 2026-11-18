/* Sponsor prefixes are dropped from displayed event titles; everything else is untouched. */
const assert=require("node:assert/strict");
const {eventTitle}=require("../assets/event-names.js");
assert.equal(eventTitle("Polymarket UFC 334: Gane vs Hokit"),"UFC 334: Gane vs Hokit");
assert.equal(eventTitle("Polymarket UFC 334 Media Day"),"UFC 334 Media Day");
assert.equal(eventTitle("Highlights from Polymarket #UFC334"),"Highlights from #UFC334");
assert.equal(eventTitle("UFC 334: Gane vs Hokit presented by Polymarket"),"UFC 334: Gane vs Hokit");
assert.equal(eventTitle("Noche UFC: Lopes vs Silva"),"Noche UFC: Lopes vs Silva","Official non-sponsor brands stay");
assert.equal(eventTitle("UFC Fight Night: Doha"),"UFC Fight Night: Doha");
assert.equal(eventTitle("Polymarket odds shift before the fight"),"Polymarket odds shift before the fight",
 "The word alone is not stripped unless it prefixes a UFC event");
assert.equal(eventTitle(null),null);
assert.equal(eventTitle(""),"");
console.log("PASS event titles drop sponsor prefixes only");
