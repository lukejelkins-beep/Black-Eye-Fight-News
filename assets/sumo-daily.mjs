/**
 * Presentation-only data guards for the BEFN Sumo Daily Head-to-Heads view.
 * No inferred fights, generated results, or replacement zeroes.
 */
export function knownNonnegativeInt(value) {
  return typeof value==='number' && Number.isSafeInteger(value) && value>=0;
}
export function dailyWinPercentage(wins,losses) {
  if(!knownNonnegativeInt(wins)||!knownNonnegativeInt(losses)||wins+losses===0)return null;
  return (100*wins/(wins+losses)).toFixed(1)+'%';
}
/** Present the source centimetre measurement as the nearest whole inch. */
export function heightFeetInches(heightCm) {
  if(typeof heightCm!=='number'||!Number.isFinite(heightCm)||heightCm<=0)return 'Not available';
  const inches=Math.round(heightCm/2.54);
  return Math.floor(inches/12)+'′'+inches%12+'″';
}
export function dailyStats({
  highestRank=null,currentRank=null,heightCm=null,weightKg=null,
  currentBashoWins=null,currentBashoLosses=null,
  careerWins=null,careerLosses=null,makuuchiWins=null,makuuchiLosses=null,
  juryoWins=null,juryoLosses=null,makushitaWins=null,makushitaLosses=null
}={}) {
  const measurement=(value,unit)=>typeof value==='number'&&Number.isFinite(value)&&value>0
    ?String(value)+unit:'Not available';
  const tally=value=>knownNonnegativeInt(value)?String(value):'Not available';
  return [
    ['Current rank',currentRank||'Not available'],
    ['Highest rank',highestRank||'Not available'],
    ['Height',measurement(heightCm,' cm')==='Not available'?'Not available':measurement(heightCm,' cm')+' ('+heightFeetInches(heightCm)+')'],
    ['Weight',measurement(weightKg,' kg')],
    ['Current basho wins',tally(currentBashoWins)],
    ['Current basho losses',tally(currentBashoLosses)],
    ['Career wins',tally(careerWins)],
    ['Career losses',tally(careerLosses)],
    ['Career win %',dailyWinPercentage(careerWins,careerLosses)||'Not available'],
    ['Makuuchi wins',tally(makuuchiWins)],
    ['Makuuchi losses',tally(makuuchiLosses)],
    ['Makuuchi win %',dailyWinPercentage(makuuchiWins,makuuchiLosses)||'Not available'],
    ['Juryo wins',tally(juryoWins)],
    ['Juryo losses',tally(juryoLosses)],
    ['Juryo win %',dailyWinPercentage(juryoWins,juryoLosses)||'Not available'],
    ['Makushita wins',tally(makushitaWins)],
    ['Makushita losses',tally(makushitaLosses)],
    ['Makushita win %',dailyWinPercentage(makushitaWins,makushitaLosses)||'Not available']
  ];
}
/** Select each wrestler's highest division with a genuinely recorded W–L pair.
 * A historic peak rank on its own is not evidence of an available division record.
 * Zero-zero and missing/incomplete stats must not be presented as a real record. */
export function highestRecordedDivision(stats){
  const wins=stats?.winsByDivision||{},losses=stats?.lossByDivision||{};
  for(const division of ['Makuuchi','Juryo','Makushita','Sandanme','Jonidan','Jonokuchi']){
    const w=wins[division],l=losses[division];
    if(knownNonnegativeInt(w)&&knownNonnegativeInt(l)&&w+l>0){
      return {division,wins:w,losses:l,record:w+'–'+l,
        percentage:dailyWinPercentage(w,l)};
    }
  }
  return null;
}
export function dailyRecentMeetings(history,a,b,limit=5) {
  if(!Array.isArray(history?.rows))return [];
  const first=Number(a),second=Number(b);
  return history.rows.filter(row=>
    row && (Number(row.winnerId)===first||Number(row.winnerId)===second) &&
    /^\d{6}$/.test(String(row.bashoId)) &&
    Number.isInteger(Number(row.day)) && Number(row.day)>=1 && Number(row.day)<=15
  ).slice(0,limit).map(row=>({
    bashoId:String(row.bashoId),day:Number(row.day),winnerId:Number(row.winnerId),
    kimarite:typeof row.kimarite==='string'&&row.kimarite.trim()?row.kimarite.trim():null
  }));
}
export function dailyDefaultDay({today=null,lastCompleted=0,announced=null,hasAnnounced=false}={}) {
  const valid=value=>Number.isInteger(value)&&value>=1&&value<=15;
  // Published next-day torikumi takes priority over today's completed bouts.
  if(hasAnnounced&&valid(announced)&&(!valid(today)||announced>today))return announced;
  if(valid(today))return today;
  if(hasAnnounced&&valid(announced))return announced;
  return valid(lastCompleted)?lastCompleted:1;
}
export function dailySelectedDate(startDate,day) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate||''))||!Number.isInteger(day)||day<1||day>15)return null;
  const start=new Date(startDate+'T00:00:00Z');
  if(!Number.isFinite(start.getTime())||start.toISOString().slice(0,10)!==startDate)return null;
  return new Date(start.getTime()+(day-1)*86400000).toISOString().slice(0,10);
}
