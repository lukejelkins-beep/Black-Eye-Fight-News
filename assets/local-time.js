/* Visitor-local dates and times. Calendar dates are not timestamps: do not convert an un-timed venue date. */
window.FightTime = (()=>{
 'use strict';
 const locale = (typeof navigator!=='undefined' && navigator.language) || 'en-AU';
 const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
 const isDateOnly = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
 const instant = value => {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)||!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const d=new Date(value);
  return Number.isFinite(d.getTime())?d:null;
 };
 const venueDay = value => {
  if(!isDateOnly(value)) return '';
  const d=new Date(value+'T12:00:00Z');
  return Number.isFinite(d.getTime())?d.toLocaleDateString(locale,{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'';
 };
 const localDate = value => {
  const d=instant(value);
  return d?d.toLocaleDateString(locale,{weekday:'short',day:'numeric',month:'short',year:'numeric'}):venueDay(value);
 };
 const localClock = value => {
  const d=instant(value);
  return d?d.toLocaleTimeString(locale,{hour:'numeric',minute:'2-digit',timeZoneName:'short'}):'';
 };
 const localDateTime = value => {
  const d=instant(value);
  return d?d.toLocaleString(locale,{weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):venueDay(value);
 };
 const dayKey = date => {
  const d=date instanceof Date?date:new Date(date);
  return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit'}).format(d):'';
 };
 const relative = (value,now=Date.now()) => {
  const d=instant(value);
  if(!d)return 'Start time awaiting confirmation';
  const remaining=d.getTime()-now;
  if(remaining<=0)return 'Scheduled start reached · awaiting confirmation';
  if(remaining<60000)return 'Starting in less than a minute';
  const minutes=Math.ceil(remaining/60000),days=Math.floor(minutes/1440),hours=Math.floor((minutes%1440)/60),mins=minutes%60;
  if(days)return 'Starts in '+days+'d'+(hours?' '+hours+'h':'');
  if(hours)return 'Starts in '+hours+'h'+(mins?' '+mins+'m':'');
  return 'Starts in '+minutes+'m';
 };
 const zoneNotice = () => 'Times shown in your local time zone ('+zone+').';
 const startReached=(value,now=Date.now())=>{const d=instant(value);return !!d&&d.getTime()<=now;};
 return {locale,zone,instant,isDateOnly,venueDay,localDate,localClock,localDateTime,dayKey,relative,zoneNotice,startReached};
})();
