import {
  entryPositionPenultimate,
  populationDirectionalThreshold,
  delayedResultMovement as delayedResultMovementRule,
} from './wheel-v3-rule-model.js';

export const TARGET_SHARE=1/7;
export {entryPositionPenultimate};
export const directionalThreshold=populationDirectionalThreshold;
export const delayedResultMovement=delayedResultMovementRule;


function rng(seed=1){let x=seed>>>0;return()=>{x=(1664525*x+1013904223)>>>0;return x/2**32;};}
function gaussian(random){let u=0,v=0;while(!u)u=random();while(!v)v=random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function winProbability(a,b){const x=Math.max(-30,Math.min(30,(a-b)/0.9));return 1/(1+Math.exp(-x));}
function makePair(id,skill,cat){return {id,skill,cat,role:'A',roleStreak:1,wait:0,lastOpp:null,promo:0,relegActive:false,relegLosses:0};}
function pair(league,id){return league.pairs.get(id);}
function counts(league){return Array.from({length:7},(_,i)=>league.ladders[i+1].length);}
function position(league,id){const p=pair(league,id);return league.ladders[p.cat].indexOf(id)+1;}

function createLeague({seed=1,counts:startCounts=Array(7).fill(12),skillGap=0.7}={}){
  const random=rng(seed),pairs=new Map(),ladders=Array.from({length:8},()=>[]);let id=1;
  for(let c=1;c<=7;c++){
    const ids=[];
    for(let i=0;i<startCounts[c-1];i++){
      const p=makePair(id,(8-c)*skillGap+gaussian(random)*0.55,c);pairs.set(id,p);ids.push(id++);
    }
    ids.sort((a,b)=>pairs.get(b).skill-pairs.get(a).skill);ladders[c]=ids;
    ids.forEach((pid,i)=>{pairs.get(pid).role=i%2===0?'D':'A';});
    if(ids.length>1){pairs.get(ids[0]).role='D';pairs.get(ids.at(-1)).role='A';}
    if(c<7&&ids.length)pairs.get(ids.at(-1)).relegActive=true;
  }
  return {random,pairs,ladders,promotions:0,relegations:0,noMatchCycles:0};
}

function structuralRoles(league,c){const ids=league.ladders[c];if(ids.length<2)return;pair(league,ids[0]).role='D';pair(league,ids.at(-1)).role='A';}
function setRole(league,id,role){const p=pair(league,id);if(p.role===role)p.roleStreak++;else{p.role=role;p.roleStreak=1;}}

function balanceRoles(league,c){
  const ids=league.ladders[c];if(ids.length<=2)return;structuralRoles(league,c);
  for(let z=0;z<ids.length*2;z++){
    const A=ids.filter(id=>pair(league,id).role==='A'),D=ids.filter(id=>pair(league,id).role==='D');
    if(Math.abs(A.length-D.length)<=1)break;
    const excess=A.length>D.length?'A':'D',target=excess==='A'?'D':'A';
    let candidates=ids.slice(1,-1).filter(id=>pair(league,id).role===excess&&pair(league,id).roleStreak>=2);
    if(!candidates.length)candidates=ids.slice(1,-1).filter(id=>pair(league,id).role===excess);
    if(!candidates.length)break;
    candidates.sort((a,b)=>pair(league,b).wait-pair(league,a).wait);
    const p=pair(league,candidates[0]);p.role=target;p.roleStreak=1;
  }
}

function chooseDefender(league,attacker,available){
  const ids=league.ladders[pair(league,attacker).cat],ai=ids.indexOf(attacker),above=ids.slice(0,ai);
  let defenders=above.filter(id=>available.has(id));if(!defenders.length)return null;
  const nonrepeat=defenders.filter(id=>id!==pair(league,attacker).lastOpp);if(nonrepeat.length)defenders=nonrepeat;
  for(let k=3;k<ai+3;k+=3){
    const window=new Set(above.slice(Math.max(0,ai-k),ai)),pool=defenders.filter(id=>window.has(id));
    if(pool.length){pool.sort((a,b)=>pair(league,b).wait-pair(league,a).wait);return pool[0];}
  }
  return null;
}

function makeMatches(league,c){
  const ids=league.ladders[c];if(ids.length<2)return[];balanceRoles(league,c);
  const attackers=ids.filter(id=>pair(league,id).role==='A').sort((a,b)=>pair(league,b).wait-pair(league,a).wait||position(league,a)-position(league,b));
  const defenders=new Set(ids.filter(id=>pair(league,id).role==='D')),used=new Set(),out=[];
  for(const a of attackers){
    if(used.has(a))continue;
    const available=new Set([...defenders].filter(id=>!used.has(id))),d=chooseDefender(league,a,available);
    if(d==null)continue;used.add(a);used.add(d);out.push([a,d]);
  }
  return out;
}

function activateLast(league,c){
  if(c>=7||!league.ladders[c].length)return;
  const p=pair(league,league.ladders[c].at(-1));
  if(!p.relegActive){p.relegActive=true;p.relegLosses=0;}
}
function thresholdFor(league,src,dst){return populationDirectionalThreshold(counts(league),src-1,dst-1);}

function insertPromoted(league,id,dst){
  const ids=league.ladders[dst],position=entryPositionPenultimate(ids.length);
  ids.splice(position-1,0,id);
  Object.assign(pair(league,id),{cat:dst,promo:0,relegActive:false,relegLosses:0,role:'A',roleStreak:1,wait:0});
  structuralRoles(league,dst);activateLast(league,dst);
}
function insertDescended(league,id,dst){
  const ids=league.ladders[dst],index=ids.length?1:0;ids.splice(index,0,id);
  Object.assign(pair(league,id),{cat:dst,promo:0,relegActive:false,relegLosses:0,role:'A',roleStreak:1,wait:0});
  structuralRoles(league,dst);activateLast(league,dst);
}
function promote(league,id){
  const p=pair(league,id),src=p.cat;if(src<=1)return;
  league.ladders[src].splice(league.ladders[src].indexOf(id),1);activateLast(league,src);insertPromoted(league,id,src-1);league.promotions++;
}
function descend(league,id){
  const p=pair(league,id),src=p.cat;if(src>=7)return;
  league.ladders[src].splice(league.ladders[src].indexOf(id),1);activateLast(league,src);insertDescended(league,id,src+1);league.relegations++;
}

function play(league,a,d){
  const pa=pair(league,a),pd=pair(league,d);if(pa.cat!==pd.cat)return;
  const c=pa.cat,ids=league.ladders[c],preFirst=ids[0],winner=league.random()<winProbability(pa.skill,pd.skill)?a:d,loser=winner===a?d:a;
  let wi=ids.indexOf(winner),li=ids.indexOf(loser);if(wi>li)[ids[wi],ids[li]]=[ids[li],ids[wi]];
  setRole(league,a,'D');setRole(league,d,'A');structuralRoles(league,c);
  pa.wait=0;pd.wait=0;pa.lastOpp=d;pd.lastOpp=a;

  if(winner===preFirst&&league.ladders[c][0]===winner&&c>1){
    const wp=pair(league,winner);wp.promo++;if(wp.promo>=thresholdFor(league,c,c-1))promote(league,winner);
  }else if(loser===preFirst){
    pair(league,loser).promo=0;if(league.ladders[c].length)pair(league,league.ladders[c][0]).promo=0;
  }

  for(const [id,isWin] of [[winner,true],[loser,false]]){
    const p=pair(league,id);if(p.cat!==c)continue;
    if(isWin&&p.relegActive){p.relegActive=false;p.relegLosses=0;}
    else if(!isWin&&p.relegActive){p.relegLosses++;if(c<7&&p.relegLosses>=thresholdFor(league,c,c+1))descend(league,id);}
  }
  activateLast(league,c);
}

function cycle(league){
  for(const p of league.pairs.values())p.wait++;
  const scheduled=[];for(let c=1;c<=7;c++)for(const [a,d] of makeMatches(league,c))scheduled.push([c,a,d]);
  for(let i=scheduled.length-1;i>0;i--){const j=Math.floor(league.random()*(i+1));[scheduled[i],scheduled[j]]=[scheduled[j],scheduled[i]];}
  let played=0;
  for(const [c,a,d] of scheduled){
    if(pair(league,a).cat!==c||pair(league,d).cat!==c)continue;
    const ids=league.ladders[c];if(!ids.includes(a)||!ids.includes(d)||ids.indexOf(a)<=ids.indexOf(d))continue;
    play(league,a,d);played++;
  }
  if(!played)league.noMatchCycles++;
  return played;
}

function rmse(values,target){return Math.sqrt(values.reduce((s,n)=>s+(n-target)**2,0)/values.length);}

export function simulateWheelV3({runs=120,years=20,counts:startCounts=Array(7).fill(12),skillGap=0.7,seedBase=30000}={}){
  const target=startCounts.reduce((s,n)=>s+n,0)/7,acc=Array(7).fill(0);
  let promotions=0,relegations=0,emptyRuns=0,rmseSum=0,topBottom=0,noMatchCycles=0;
  for(let run=0;run<runs;run++){
    const league=createLeague({seed:seedBase+run,counts:startCounts,skillGap});
    for(let m=0;m<years*12;m++)cycle(league);
    const cc=counts(league);cc.forEach((n,i)=>acc[i]+=n);promotions+=league.promotions;relegations+=league.relegations;
    emptyRuns+=cc.some(n=>n===0)?1:0;rmseSum+=rmse(cc,target);topBottom+=cc[0]-cc[6];noMatchCycles+=league.noMatchCycles;
  }
  return {counts:acc.map(n=>n/runs),promotions:promotions/runs,relegations:relegations/runs,emptyRunRate:emptyRuns/runs,stabilityRmse:rmseSum/runs,topMinusBottom:topBottom/runs,noMatchCycles:noMatchCycles/runs,total:startCounts.reduce((s,n)=>s+n,0)};
}

if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]){
  console.log('Wheel v3 longitudinal model · penultimate entry');
  for(const skillGap of [0,0.7,1]){
    const r=simulateWheelV3({skillGap});
    console.log('gap='+skillGap.toFixed(1),'cats=['+r.counts.map(x=>x.toFixed(2)).join(', ')+']','P='+r.promotions.toFixed(1),'R='+r.relegations.toFixed(1),'empty='+(100*r.emptyRunRate).toFixed(1)+'%','RMSE='+r.stabilityRmse.toFixed(2),'top-bottom='+r.topMinusBottom.toFixed(2));
  }
}
