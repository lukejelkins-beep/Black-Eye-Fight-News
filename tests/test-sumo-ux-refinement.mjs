import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dailyWinPercentage,dailyRecentMeetings} from '../assets/sumo-daily.mjs';
import {rankPositions} from '../assets/sumo-data.mjs';

const ui=readFileSync(new URL('../assets/sumo.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/sumo-editorial.css',import.meta.url),'utf8');
const dailyCss=readFileSync(new URL('../assets/sumo-daily.css',import.meta.url),'utf8');
function body(name){
 const first=ui.indexOf('function '+name+'('),last=ui.indexOf('\nfunction ',first+8);
 assert.ok(first>=0&&last>first,'renderer '+name+' must exist');
 return ui.slice(first,last);
}
test('F09 filtered search explicitly scopes empty results and preserves query for all-divisions reset',()=>{
 assert.match(body('directoryResults'),/No matches in /);
 assert.match(body('directoryResults'),/data-directory-reset/);
 assert.match(ui,/STATE\.division='All';STATE\.visible=24;refreshDir\(\)/);
});
test('F10 true zero losses are never mistaken for unavailable kimarite',()=>{
 const chart=body('h2hKimariteChart');
 assert.match(chart,/if\(!selected\.length\)/);
 assert.match(chart,/No recorded losses against /);
 assert.match(chart,/Technique details unavailable for /);
 assert.ok(chart.indexOf('if(!selected.length)')<chart.indexOf('if(!known)'),
   'zero must be decided before missing-technique classification');
});
test('F18 H2H return preserves origin, division, day and scroll',()=>{
 const full=body('renderHeadToHead');
 assert.match(full,/Back to Day /);
 assert.match(full,/origin\?\.hash/);
 assert.match(ui,/STATE\.h2hReturn=\{hash:location\.hash,scrollY:window\.scrollY/);
 for(const term of ['bashoDivision','matchupDivision','matchupDay','scrollY'])
   assert.match(ui,new RegExp('STATE\\.h2hReturn\\.'+term));
});
test('F30 history captions reflect actual available number, not always five',()=>{
 const preview=body('headToHeadPreview'),daily=body('dailyMeetingMarkup');
 assert.match(preview,/Recent meetings \('/);
 assert.match(preview,/Math\.min\(5,h2h\.rows\.length\)/);
 assert.match(daily,/meetings\.length\+' available/);
 const sample={rows:[{winnerId:4,bashoId:'202611',day:4,kimarite:'yorikiri'},
   {winnerId:5,bashoId:'202609',day:12,kimarite:'oshidashi'},
   {winnerId:4,bashoId:'202607',day:1,kimarite:'hatakikomi'}]};
 assert.equal(dailyRecentMeetings(sample,4,5).length,3);
});
test('F07 percentages preserve sourced wins/losses, no fabricated zero or precision inflation',()=>{
 assert.equal(dailyWinPercentage(207,73),'73.9%');
 assert.equal(dailyWinPercentage(0,5),'0.0%');
 assert.equal(dailyWinPercentage(0,0),null);
 assert.equal(dailyWinPercentage(null,7),null);
 assert.match(body('comparisonGrid'),/divisionLabel\+' W–L'/);
 assert.match(body('comparisonGrid'),/DIVS\.includes\(division\)/);
 assert.match(body('comparisonGrid'),/Career win %/);
 assert.match(dailyCss,/\.sumo-comparison-row/);
 assert.match(dailyCss,/@media\(max-width:350px\)/);
});
test('F01/F03 bounded portrait and compact standings override old full-width layouts',()=>{
 assert.match(css,/grid-template-columns:minmax\(280px,390px\)/);
 assert.match(css,/max-height:520px!important/);
 assert.match(css,/\.sumo-standings-row/);
 assert.doesNotMatch(css,/transform:scale\(1\.9\)/);
 assert.match(body('renderProfile'),/sectionNav\(w\.sourceId\)\+lastFiveStrip\(w\)/);
});
test('F08 ordinal position preserves East versus West without altering source rank data',()=>{
 const b={
   Makuuchi:{east:[{rikishiID:7,rank:'Ozeki 1 East'}],west:[{rikishiID:8,rank:'Ozeki 1 West'}]},
   Juryo:{east:[{rikishiID:9,rank:'Juryo 1 East'}],west:[{rikishiID:10,rank:'Juryo 1 West'}]},
   Makushita:{east:[{rikishiID:11,rank:'Makushita 1 East'}],west:[{rikishiID:12,rank:'Makushita 1 West'}]}
 };
 const positions=rankPositions(b);
 assert.equal(positions.get(7).position+1,positions.get(8).position);
 assert.match(body('movementMarkup'),/old\.position-now\.position/);
 assert.match(body('movementMarkup'),/shift>0\?'up':shift<0\?'down':'same'/);
});
