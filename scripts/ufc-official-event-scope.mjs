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
 return /\bufc\b/i.test(text)&&!isFeederUfcEvent(text);
}
