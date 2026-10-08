import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {relegationLossThreshold} from '../src/core.js';

export const DEFAULT_RUNS=120;
export const DEFAULT_HORIZONS=[5,10,20];
export const DEFAULT_START_PER_CATEGORY=12;
export const DEFAULT_SKILL_GAPS=[0,0.7,1.0];

export const BALANCE_RULES=[
  {key:'fixed-3',label:'P3/R3 fijo',promotionWins:3,relegation:'fixed',relegationLosses:3},
  {key:'fixed-5',label:'P3/R5 fijo',promotionWins:3,relegation:'fixed',relegationLosses:5},
  {key:'adaptive-gap-4',label:'P3/R2-3 gap>=4',promotionWins:3,relegation:'adaptive',balanceGap:4},
  {key:'adaptive-gap-5',label:'P3/R2-3 gap>=5',promotionWins:3,relegation:'adaptive',balanceGap:5},
  {key:'adaptive-gap-6',label:'P3/R2-3 gap>=6',promotionWins:3,relegation:'adaptive',balanceGap:6},
  {key:'promotion-4-fixed-3',label:'P4/R3 fijo',promotionWins:4,relegation:'fixed',relegationLosses:3},
];

function rng(seed=1){let x=seed>>>0;return()=>{x=(1664525*x+1013904223)>>>0;return x/2**32;};}
function gaussian(random){let u=0,v=0;while(!u)u=random();while(!v)v=random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function winProbability(a,b){const x=(a-b)/0.8;return 1/(1+Math.exp(-Math.max(-30,Math.min(30,x))));}

export function expectedConsecutiveRunWait(probability,streak){
  const p=Number(probability),k=Number(streak);
  if(!(p>0&&p<1)||!Number.isInteger(k)||k<1)throw new Error('invalid run parameters');
  return (1-p**k)/((1-p)*p**k);
}

function relegationThreshold(rule,{categoryNumber,currentActiveCount,lowerActiveCount}){
  if(Number(categoryNumber)>=7)return Number.POSITIVE_INFINITY;
  if(rule.relegation==='fixed')return Number(rule.relegationLosses);
  if(rule.relegation==='adaptive'){
    if(Number(rule.balanceGap)===5)return relegationLossThreshold({categoryNumber,currentActiveCount,lowerActiveCount});
    return Number(currentActiveCount)-Number(lowerActiveCount)>=Number(rule.balanceGap)?2:3;
  }
  throw new Error('Unknown relegation mode '+rule.relegation);
}

function createLeague(seed,skillGap,startPerCategory){
  const random=rng(seed),skill=new Map(),cat=new Map(),wins=new Map(),losses=new Map();
  const ladders=Array.from({length:8},()=>[]);let id=1;
  for(let c=1;c<=7;c++){
    for(let i=0;i<startPerCategory;i++){
      skill.set(id,(8-c)*skillGap+gaussian(random)*0.55);cat.set(id,c);wins.set(id,0);losses.set(id,0);ladders[c].push(id);id++;
    }
    ladders[c].sort((a,b)=>skill.get(b)-skill.get(a));
  }
  return {random,skill,cat,wins,losses,ladders,promotions:0,relegations:0};
}
function move(league,pairId,dir){
  const from=league.cat.get(pairId),to=from+dir;
  league.ladders[from].splice(league.ladders[from].indexOf(pairId),1);league.cat.set(pairId,to);
  if(dir<0){league.ladders[to].push(pairId);league.promotions++;}
  else{league.ladders[to].splice(league.ladders[to].length?1:0,0,pairId);league.relegations++;}
  league.wins.set(pairId,0);league.losses.set(pairId,0);
}
function play(league,a,b,rule){
  const c=league.cat.get(a),ladder=league.ladders[c];
  const winner=league.random()<winProbability(league.skill.get(a),league.skill.get(b))?a:b,loser=winner===a?b:a;
  let wi=ladder.indexOf(winner),li=ladder.indexOf(loser);if(wi>li)[ladder[wi],ladder[li]]=[ladder[li],ladder[wi]];
  league.wins.set(winner,league.wins.get(winner)+1);league.losses.set(winner,0);league.losses.set(loser,league.losses.get(loser)+1);league.wins.set(loser,0);
  const wc=league.cat.get(winner);if(wc>1&&league.ladders[wc][0]===winner&&league.wins.get(winner)>=rule.promotionWins)move(league,winner,-1);
  const lc=league.cat.get(loser);if(lc>=7)return;
  const need=relegationThreshold(rule,{categoryNumber:lc,currentActiveCount:league.ladders[lc].length,lowerActiveCount:league.ladders[lc+1].length});
  if(league.ladders[lc].at(-1)===loser&&league.losses.get(loser)>=need)move(league,loser,1);
}
function month(league,rule){
  const played=new Set(),snapshots=Array.from({length:8},(_,c)=>c?[...league.ladders[c]]:[]);
  for(let c=1;c<=7;c++){
    const ids=snapshots[c].filter(id=>!played.has(id)&&league.cat.get(id)===c);
    for(let i=ids.length-1;i>0;i--){const j=Math.floor(league.random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}
    for(let i=0;i+1<ids.length;i+=2){const a=ids[i],b=ids[i+1];if(league.cat.get(a)!==c||league.cat.get(b)!==c||played.has(a)||played.has(b))continue;play(league,a,b,rule);played.add(a);played.add(b);}
  }
}
function categoryCounts(league){return Array.from({length:7},(_,i)=>league.ladders[i+1].length);}
function rmse(counts,startPerCategory){return Math.sqrt(counts.reduce((sum,n)=>sum+(n-startPerCategory)**2,0)/counts.length);}
function maxAdjacentGap(counts){let out=0;for(let i=0;i+1<counts.length;i++)out=Math.max(out,Math.abs(counts[i]-counts[i+1]));return out;}

export function simulateBalance({
  rule,
  skillGap,
  runs=DEFAULT_RUNS,
  horizons=DEFAULT_HORIZONS,
  startPerCategory=DEFAULT_START_PER_CATEGORY,
  seedBase=20000,
}={}){
  if(!rule)throw new Error('rule is required');
  const orderedHorizons=[...new Set(horizons.map(Number))].sort((a,b)=>a-b),maxYears=Math.max(...orderedHorizons);
  const acc=Object.fromEntries(orderedHorizons.map(h=>[h,{counts:Array(7).fill(0),promotions:0,relegations:0,emptyRuns:0,endRmse:0,maxAdjacentGap:0,topMinusBottom:0}]));
  for(let run=0;run<runs;run++){
    const league=createLeague(seedBase+run,skillGap,startPerCategory);let emptyEver=false;
    for(let m=1;m<=maxYears*12;m++){
      month(league,rule);const counts=categoryCounts(league);if(counts.some(n=>n===0))emptyEver=true;
      if(m%12!==0)continue;const years=m/12;if(!acc[years])continue;const a=acc[years];
      for(let i=0;i<7;i++)a.counts[i]+=counts[i];a.promotions+=league.promotions;a.relegations+=league.relegations;a.emptyRuns+=emptyEver?1:0;a.endRmse+=rmse(counts,startPerCategory);a.maxAdjacentGap+=maxAdjacentGap(counts);a.topMinusBottom+=counts[0]-counts[6];
    }
  }
  return Object.fromEntries(orderedHorizons.map(h=>{const a=acc[h];return [h,{counts:a.counts.map(x=>x/runs),promotions:a.promotions/runs,relegations:a.relegations/runs,emptyRunRate:a.emptyRuns/runs,stabilityRmse:a.endRmse/runs,maxAdjacentGap:a.maxAdjacentGap/runs,topMinusBottom:a.topMinusBottom/runs}];}));
}

export function runBalanceMatrix({rules=BALANCE_RULES,skillGaps=DEFAULT_SKILL_GAPS,...options}={}){
  return Object.fromEntries(rules.map(rule=>[rule.key,Object.fromEntries(skillGaps.map(skillGap=>[String(skillGap),simulateBalance({rule,skillGap,...options})]))]));
}

export function aggregateAcrossSkillGaps(matrix,{rules=BALANCE_RULES,skillGaps=DEFAULT_SKILL_GAPS,horizons=DEFAULT_HORIZONS}={}){
  const output=[];
  for(const rule of rules)for(const years of horizons){
    const rows=skillGaps.map(g=>matrix[rule.key][String(g)][years]);
    output.push({rule:rule.key,label:rule.label,years,counts:Array.from({length:7},(_,i)=>rows.reduce((s,r)=>s+r.counts[i],0)/rows.length),promotions:rows.reduce((s,r)=>s+r.promotions,0)/rows.length,relegations:rows.reduce((s,r)=>s+r.relegations,0)/rows.length,emptyRunRate:rows.reduce((s,r)=>s+r.emptyRunRate,0)/rows.length,stabilityRmse:rows.reduce((s,r)=>s+r.stabilityRmse,0)/rows.length,maxAdjacentGap:rows.reduce((s,r)=>s+r.maxAdjacentGap,0)/rows.length,topMinusBottom:rows.reduce((s,r)=>s+r.topMinusBottom,0)/rows.length});
  }
  return output;
}
function fmtCounts(v){return '['+v.map(x=>x.toFixed(1)).join(', ')+']';}
function printCli(){
  const matrix=runBalanceMatrix(),summary=aggregateAcrossSkillGaps(matrix);
  console.log('LA RED category balance · '+DEFAULT_RUNS+' runs × horizons '+DEFAULT_HORIZONS.join('/')+' years · '+DEFAULT_START_PER_CATEGORY+' starting pairs/category');
  console.log('Expected wait for 3 vs 5 consecutive losses: p=.5 '+expectedConsecutiveRunWait(.5,3).toFixed(1)+' vs '+expectedConsecutiveRunWait(.5,5).toFixed(1)+' matches; p=.6 '+expectedConsecutiveRunWait(.6,3).toFixed(1)+' vs '+expectedConsecutiveRunWait(.6,5).toFixed(1)+'.');
  for(const years of DEFAULT_HORIZONS){
    console.log('\n'+years+' years · mean across skill gaps '+DEFAULT_SKILL_GAPS.join('/'));
    for(const row of summary.filter(r=>r.years===years))console.log(row.label.padEnd(20)+' cats='+fmtCounts(row.counts)+' P='+row.promotions.toFixed(1)+' R='+row.relegations.toFixed(1)+' empty='+(100*row.emptyRunRate).toFixed(1)+'% RMSE='+row.stabilityRmse.toFixed(2)+' top-bottom='+row.topMinusBottom.toFixed(1));
  }
}
const isMain=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isMain)printCli();
