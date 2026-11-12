'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8'),script=fs.readFileSync('assets/fighter-hover.js','utf8');
// Inline scripts are separately syntax-validated by tests/test-local-time.cjs.
new vm.Script(script);
for(const [source,kind] of [[html,'fighter-preview'],[script,'fighter-mention']]){
 assert(source.includes('class="'+kind+'-close"'),'Close button exists for '+kind);
 assert(source.includes('aria-label="Close fighter photo"'),'Close button is named for '+kind);
 assert(source.includes(kind+'-close:focus-visible'),'Close control shows keyboard focus for '+kind);
 assert(source.includes("e.stopPropagation();hide(true)"),'Close handler dismisses '+kind);
 assert(source.includes("e.key==='Escape'"),'Escape dismisses '+kind);
}
assert(html.includes('#fighter-photo-preview.is-open.is-pinned{pointer-events:auto}'));
assert(script.includes('#all-fighter-preview.visible.locked{pointer-events:auto}'));
assert(html.includes("popup.classList.remove('is-open','is-pinned')"));
assert(script.includes("tip.classList.remove('visible','locked')"));
assert(script.includes("if(el&&el===active&&!locked&&(!e.relatedTarget||!el.contains(e.relatedTarget)))"),
 "Pointer leave must not call contains on a null inactive fighter preview");
console.log('Fighter portrait close controls: both viewers validated');
