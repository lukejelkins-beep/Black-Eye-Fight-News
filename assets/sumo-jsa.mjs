/**
 * Japan Sumo Association (sumo.or.jp) torikumi: parsing and conversion.
 * Pure functions, no network. The scraper (scripts/sumo-jsa-scrape.mjs) reads the
 * rendered page like a visitor and hands the table HTML to parseJsaTable().
 * JSA profile ids are the roster's `officialNskId`.
 */
export const JSA_DIVISION_TABS = Object.freeze({Makuuchi:1,Juryo:2,Makushita:3});
export const JSA_BASE = 'https://www.sumo.or.jp/EnHonbashoMain/torikumi/';

const text = s => String(s||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();

function side(cell){
  const id = /\/profile\/(\d+)\//.exec(cell);
  if(!id) return null;
  return {
    nskId:Number(id[1]),
    rank:text((/class="rank"[^>]*>([\s\S]*?)<\/span>/.exec(cell)||[])[1]),
    name:text((/class="name"[^>]*>([\s\S]*?)<\/span>\s*(?:<span|<\/div)/.exec(cell)||[])[1]),
    record:text((/class="perform"[^>]*>([\s\S]*?)<\/span>/.exec(cell)||[])[1])
  };
}

/** @returns {{east,west,winner:'east'|'west'|null,kimarite:string}[]} in page order */
export function parseJsaTable(html){
  const rows=[];
  for(const tr of String(html||'').split(/<tr[\s>]/i).slice(1)){
    const cells=tr.split(/<td[\s>]/i).slice(1);
    if(cells.length<5) continue;
    const east=side(cells[0]), west=side(cells[4]);
    if(!east||!west||east.nskId===west.nskId) continue;
    const eastWon=/class="[^"]*\bwin\b[^"]*"/.test(cells[0]) || /class="result win"/.test(cells[1]);
    const westWon=/class="[^"]*\bwin\b[^"]*"/.test(cells[4]) || /class="result win"/.test(cells[3]);
    const winner=eastWon&&!westWon?'east':westWon&&!eastWon?'west':null;
    const kimarite=winner?text((/class="decide"[^>]*>([\s\S]*?)<\/td>/.exec(cells[2]+'</td>')||[])[1]).toLowerCase():'';
    rows.push({east,west,winner,kimarite});
  }
  return rows;
}

/** "Day 11  November 18, 2026" -> 11 */
export function jsaHeadingDay(heading){
  const m=/Day\s+(\d{1,2})\b/i.exec(String(heading||''));
  return m?Number(m[1]):null;
}

/**
 * Convert scraped JSA rows to the sumo-api-shaped source the site already reads
 * ({date, torikumi:[{eastId,westId,winnerId,...}]}), using roster ids.
 * Bouts involving anyone outside the tracked roster are dropped and counted.
 */
export function jsaToTorikumiSource({rows,roster,bashoId,division,day}){
  const byNsk=new Map((roster||[]).filter(r=>r.officialNskId).map(r=>[Number(r.officialNskId),r]));
  const torikumi=[];let dropped=0;
  (rows||[]).forEach((row,i)=>{
    const e=byNsk.get(row.east.nskId), w=byNsk.get(row.west.nskId);
    if(!e||!w){dropped++;return;}
    const winner=row.winner==='east'?e:row.winner==='west'?w:null;
    torikumi.push({
      id:`${bashoId}-${day}-${i+1}-${e.sourceId}-${w.sourceId}`,bashoId:String(bashoId),division,day,matchNo:i+1,
      eastId:e.sourceId,eastShikona:e.shikonaEn,eastRank:e.currentRank||'',
      westId:w.sourceId,westShikona:w.shikonaEn,westRank:w.currentRank||'',
      kimarite:winner?row.kimarite:'',winnerId:winner?winner.sourceId:0,
      winnerEn:winner?winner.shikonaEn:'',winnerJp:''
    });
  });
  return {source:{date:String(bashoId),torikumi},dropped};
}
