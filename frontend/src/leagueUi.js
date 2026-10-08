// These inputs explicitly use Argentina time, independently of the device timezone.
export function argentinaInputToIso(value){
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value||''))return '';
  const date=new Date(`${value}-03:00`);
  return Number.isNaN(date.getTime())?'':date.toISOString();
}

export function toArgentinaInput(value){
  if(!value)return '';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '';
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
  }).formatToParts(date).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

export function assignmentPairName(id,pair,assignment){
  return Number(id)===Number(pair.id)?pair.players:assignment.rival.players;
}

export function resultScoreText(version){
  if(version.result_type==='injury_abandonment')return 'Lesión / abandono';
  return (version.score?.sets||[]).map(s=>`${s.pairA}–${s.pairB}${s.kind==='match_tiebreak'?' (super tie-break)':''}`).join(' · ');
}

export function canEditResult(assignment){
  return ['open','result_pending'].includes(assignment?.status);
}
