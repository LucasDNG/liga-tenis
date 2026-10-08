export const TZ = 'America/Argentina/Buenos_Aires';
export const DAY = 24*60*60*1000;

export function problem(message,status=400){const e=new Error(message);e.statusCode=status;return e;}
export function normalizeDni(v){return String(v??'').replace(/\D/g,'');}
export function normalizePhone(v){return String(v??'').replace(/[^\d+]/g,'').trim();}
export function normalizeDateKey(value){
  const d=new Date(value); if(Number.isNaN(d.getTime())) throw problem('Fecha inválida');
  return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}
export function validResponsibilityProposal(createdAt, deadlineAt){
  return new Date(createdAt).getTime() <= new Date(deadlineAt).getTime()-48*60*60*1000;
}
export function normalizeScore(input){
  if(!input || !Array.isArray(input.sets)) throw problem('Marcador inválido');
  if(input.sets.length<2 || input.sets.length>3) throw problem('El partido debe tener 2 o 3 parciales');
  const sets=input.sets.map((raw,index)=>{
    const kind=raw.kind==='match_tiebreak'?'match_tiebreak':'set';
    const a=Number(raw.pairA), b=Number(raw.pairB);
    if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<0||a===b) throw problem('Parcial inválido');
    if(kind==='set'){
      const hi=Math.max(a,b), lo=Math.min(a,b);
      const normal=(hi===6&&lo<=4)||(hi===7&&(lo===5||lo===6));
      if(!normal) throw problem('Set inválido');
    }else{
      if(input.sets.length!==3||index!==2) throw problem('El super tie-break solo puede reemplazar al tercer set');
      if(Math.max(a,b)<10||Math.abs(a-b)<2) throw problem('Super tie-break inválido');
    }
    return {kind,pairA:a,pairB:b};
  });
  const winners=sets.map(s=>s.pairA>s.pairB?'A':'B');
  if(sets.length===2 && winners[0]!==winners[1]) throw problem('Un partido a dos sets necesita ganador 2-0');
  if(sets.length===3){
    if(winners[0]===winners[1]) throw problem('El tercer parcial solo se juega con 1-1');
    const a=winners.filter(w=>w==='A').length;
    if(a!==1&&a!==2) throw problem('Resultado 2-1 inválido');
  }
  return {sets};
}
export function scoreGames(score){
  if(!score?.sets) return {a:0,b:0,diff:0};
  let a=0,b=0;
  for(const s of score.sets){if(s.kind==='set'){a+=s.pairA;b+=s.pairB;}}
  return {a,b,diff:a-b};
}
export function resultEquals(a,b){
  if(!a||!b) return false;
  if(Number(a.winner_pair_id)!==Number(b.winner_pair_id)) return false;
  if(String(a.result_type)!==String(b.result_type)) return false;
  if(normalizeDateKey(a.played_at)!==normalizeDateKey(b.played_at)) return false;
  return JSON.stringify(a.score??null)===JSON.stringify(b.score??null) && Number(a.abandoned_pair_id||0)===Number(b.abandoned_pair_id||0);
}
export function swapLadder(rows,winnerId,loserId){
  const copy=rows.map(r=>({...r}));
  const w=copy.find(r=>Number(r.id)===Number(winnerId)); const l=copy.find(r=>Number(r.id)===Number(loserId));
  if(!w||!l) throw problem('Pareja inexistente');
  if(Number(w.position)>Number(l.position)){const tmp=w.position;w.position=l.position;l.position=tmp;}
  return copy.sort((a,b)=>a.position-b.position);
}
export function chooseOpponent(pair,candidates,lastMeetings={}){
  const ranked=[...candidates].map(c=>({c,last:lastMeetings[`${Math.min(pair.id,c.id)}:${Math.max(pair.id,c.id)}`]||null}));
  ranked.sort((x,y)=>{
    if(x.last===null&&y.last!==null)return -1;
    if(x.last!==null&&y.last===null)return 1;
    if(x.last&&y.last){const d=new Date(x.last)-new Date(y.last);if(d)return d;}
    return Number(x.c.id)-Number(y.c.id);
  });
  return ranked[0]?.c||null;
}
export function individualCategoryAfterMove(current,pairFrom,pairTo){
  const cur=current==null?null:Number(current); const from=Number(pairFrom), to=Number(pairTo);
  if(cur==null) return to;
  if(to<from) return to; // ascenso real: ambos lo ganan
  if(to>from && to>cur) return to; // descenso por debajo del nivel propio
  return cur;
}

export function eloForPosition({activeCount,activePosition,played,categoryNumber,defenses=0,state='active'}){
  if(state!=='active'||Number(played)===0)return 0;
  const n=Number(activeCount),pos=Number(activePosition);
  let elo=n<=1?2000:2000*(n-pos)/(n-1);
  if(Number(categoryNumber)===1&&pos===1)elo=2000+Number(defenses||0);
  return elo;
}
export const RELEGATION_BALANCE_GAP = 5;
export function relegationLossThreshold({categoryNumber,currentActiveCount,lowerActiveCount}){
  if(Number(categoryNumber)>=7)return Number.POSITIVE_INFINITY;
  const current=Math.max(0,Number(currentActiveCount)||0);
  const lower=Math.max(0,Number(lowerActiveCount)||0);
  return current-lower>=RELEGATION_BALANCE_GAP?2:3;
}

export function simultaneousPenaltyOrder(order,penalizedIds,debt={}){
  const out=[...order];const penalized=new Set([...penalizedIds].map(Number));const nextDebt={...debt};let i=0;
  while(i<out.length){if(!penalized.has(Number(out[i]))){i++;continue;}let j=i;while(j+1<out.length&&penalized.has(Number(out[j+1])))j++;if(j+1<out.length){const next=out[j+1];out.splice(j+1,1);out.splice(i,0,next);i=j+2;}else{for(let k=i;k<=j;k++){const id=Number(out[k]);nextDebt[id]=Number(nextDebt[id]||0)+1;}break;}}
  return {order:out,debt:nextDebt};
}
