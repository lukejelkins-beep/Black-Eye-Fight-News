/**
 * UFC main-roster event scope. UFCalendar labels its feeder tournaments
 * "ufc" too; a DWCS/Road-to-UFC appearance does NOT make an athlete a
 * UFC-roster fighter or qualify as one of their last five UFC bouts.
 *
 * A missing title cannot prove the event was an official UFC fight card.
 * Keep this gate shared by coverage, source-queue and stats builders.
 */
export function isFeederUfcEvent(title){
 const name=String(title||"").trim();
 return /\b(?:dana\s+white[’']?s\s+)?contender\s+series\b|\bdwcs\b|\broad\s+to\s+ufc\b/i.test(name);
}
export function isOfficialUfcEvent(title){
 const name=String(title||"").trim();
 return /\bufc\b/i.test(name)&&!isFeederUfcEvent(name);
}
export const isSettledBout=status=>["completed","draw","no_contest"].includes(status);

/** Pure MMA promotions; mixed-rules promotions require fight-level evidence. */
export const MMA_ONLY_PROMOTIONS=new Set([
 "pfl","bellator","fnc","aca","cage-warriors","jungle-fight","rkena",
 "oktagon","ksw","lfa","invicta","cffc","fury-fc","eagle-fc",
 "brave-cf","combate-global","road-fc","pancrase","deep"
]);
export const MIXED_RULES_PROMOTIONS=new Set(["rizin","one","one-championship"]);
export const NON_MMA_PROMOTIONS=new Set([
 "bkfc","bare-knuckle-fc","glory","karate-combat","raf","adcc","ibjjf",
 "ufc-bjj","flo-grappling","flo-grappling-wno","wno"
]);
