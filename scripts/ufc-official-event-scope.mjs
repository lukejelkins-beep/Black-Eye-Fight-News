/**
 * Official UFC card filter. Provider org="ufc" also covers Dana White's
 * Contender Series and Road to UFC feeder tournaments. These do not qualify
 * as official UFC roster bouts or UFC-only statistics.
 */
export function isFeederUfcEvent(title){
 const text=String(title||"").trim();
 return /\b(?:dana\s+white[’']?s\s+)?contender\s+series\b|\bdwcs\b|\broad\s+to\s+ufc\b/i.test(text);
}
export function isOfficialUfcEvent(title){
 const text=String(title||"").trim();
 // Official TUF season finales are UFC cards even when the event title
 // does not contain the letters "UFC". TV-season qualifying bouts are not.
 const officialFinale=/\bthe\s+ultimate\s+fighter\b/i.test(text)&&/\bfinale\b/i.test(text);
 return (/\bufc\b/i.test(text)||officialFinale)&&!isFeederUfcEvent(text);
}


/**
 * Some Road to UFC cards contain independently promoted, official UFC bouts
 * alongside feeder tournament matches. The EVENT title cannot establish
 * eligibility for every bout on that card. Only the exact official showcase
 * match identified below is exempt; other Road to UFC fights remain excluded.
 *
 * Sources:
 * https://www.ufc.com/news/road-to-ufc-live-results-season-4-semifinals-shi-vs-brasil-recaps-official-scorecards-interviews-shanghai
 * https://www.ufc.com/athlete/bruna-brasil
 * https://ufcstats.com/fight-details/abf5f4d6f777cf7b
 */
export function isOfficialUfcBout(bout){
 if(!bout||bout.org!=="ufc")return false;
 if(isOfficialUfcEvent(bout.event))return true;
 const corners=[bout.a,bout.b].filter(Boolean);
 const norm=x=>String(x||"").toLowerCase().replace(/[^a-z0-9]/g,"");
 const slugs=corners.map(x=>String(x.slug||""));
 const names=corners.map(x=>norm(x.name));
 return String(bout.id)==="60900"&&
  bout.eventDate==="2025-08-22"&&
  /^Road to UFC Season 4 Semifinals$/i.test(String(bout.event||""))&&
  corners.length===2&&slugs.includes("bruna-brasil")&&
  (slugs.includes("shi-ming")||slugs.includes("ming-shi")||names.includes("shiming")||names.includes("mingshi"))&&
  names.includes("brunabrasil")&&
  (bout.result?.method==="decision_unanimous"||
   bout.result?.method==="decision");
}
