export function pairKey(memberA,memberB){
  const a=Number(memberA),b=Number(memberB);
  if(!Number.isInteger(a)||!Number.isInteger(b)||a===b)throw new Error('invalid members');
  return a<b?`${a}:${b}`:`${b}:${a}`;
}

export function individualCategoriesAfterDescent(memberCategories,newCategory){
  return memberCategories.map(value=>Math.max(Number(value),Number(newCategory)));
}

export function categoryForReformedPair({memberCategories,pendingDescentCategory=null}){
  if(pendingDescentCategory!=null)return Number(pendingDescentCategory);
  return Math.min(...memberCategories.map(Number));
}

export function shouldResetPairFailures(closeReason){
  return closeReason==='real_match_resolved'||closeReason==='rival_only_failure';
}

export function zoneAfterFormation({category,position,activeCount,realMatchesBefore,firstMatchJustClosed=false}){
  const c=Number(category),pos=Number(position),n=Number(activeCount),played=Number(realMatchesBefore);
  const isPromotionSpot=c>=2&&c<=7&&pos===1;
  const isRelegationSpot=c>=1&&c<=6&&pos===n;
  if(!isPromotionSpot&&!isRelegationSpot)return {zone:null,count:0};
  if(played===0&&!firstMatchJustClosed)return {zone:'awaiting_first_match',count:0};
  if(isPromotionSpot)return {zone:'promotion',count:0};
  return {zone:'relegation',count:0};
}

export function inactivityReturnPosition({originalPosition,fullMonths,activeCount}){
  const original=Number(originalPosition),months=Number(fullMonths),active=Number(activeCount);
  if(original<1||months<0||active<0)throw new Error('invalid inactivity data');
  const base=original===1?2:original;
  const lost=Math.max(0,Math.floor(months)-3);
  const desired=base+lost;
  return Math.min(desired,active+1);
}

export function recordReign({currentDefenses,historicalMax}){
  const defenses=Number(currentDefenses),max=Number(historicalMax);
  if(defenses>max)return {historicalMax:defenses,status:'new_record'};
  if(defenses===max&&defenses>0)return {historicalMax:max,status:'shared_record'};
  return {historicalMax:max,status:'below_record'};
}


export function fullCalendarMonthsBetween(startValue,endValue){
  const start=new Date(startValue),end=new Date(endValue);
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<start)throw new Error('invalid month range');
  let months=(end.getUTCFullYear()-start.getUTCFullYear())*12+(end.getUTCMonth()-start.getUTCMonth());
  const targetYear=start.getUTCFullYear()+Math.floor((start.getUTCMonth()+months)/12);
  const targetMonth=(start.getUTCMonth()+months)%12;
  const lastDay=new Date(Date.UTC(targetYear,targetMonth+1,0)).getUTCDate();
  const anniversary=new Date(Date.UTC(
    targetYear,
    targetMonth,
    Math.min(start.getUTCDate(),lastDay),
    start.getUTCHours(),
    start.getUTCMinutes(),
    start.getUTCSeconds(),
    start.getUTCMilliseconds(),
  ));
  if(anniversary>end)months--;
  return Math.max(0,months);
}

export function resultAllowedAfterCancellation({playedAt,cancelledAt}){
  if(cancelledAt==null)return true;
  const played=new Date(playedAt),cancelled=new Date(cancelledAt);
  if(Number.isNaN(played.getTime())||Number.isNaN(cancelled.getTime()))throw new Error('invalid cancellation dates');
  return played<=cancelled;
}

export function deadlineFromServerTime(serverNowValue,days){
  const now=new Date(serverNowValue),n=Number(days);
  if(Number.isNaN(now.getTime())||!Number.isFinite(n)||n<0)throw new Error('invalid deadline data');
  return new Date(now.getTime()+n*24*60*60*1000);
}


export function formationComplete(activeCountsByCategory){
  if(!Array.isArray(activeCountsByCategory)||activeCountsByCategory.length!==7)throw new Error('formation requires seven categories');
  return activeCountsByCategory.every(value=>Number(value)>=5);
}

export function forcedRoleForPosition({position,activeCount}){
  const pos=Number(position),n=Number(activeCount);
  if(!Number.isInteger(pos)||!Number.isInteger(n)||pos<1||n<1||pos>n)throw new Error('invalid ladder position');
  if(n===1)return null;
  if(pos===1)return 'defense';
  if(pos===n)return 'attack';
  return null;
}

export function roleAfterRealMatch({previousRole,wasAttacker,roleStreak=0,position,activeCount,defenseRequiredUntilReal=false}){
  const forced=forcedRoleForPosition({position,activeCount});
  const obligationStillPending=Boolean(defenseRequiredUntilReal)&&Boolean(wasAttacker);
  if(forced){
    return {
      role:forced,
      roleStreak:previousRole===forced?Number(roleStreak)+1:1,
      defenseRequiredUntilReal:forced==='attack'?false:obligationStillPending,
    };
  }
  const next=wasAttacker?'defense':'attack';
  return {
    role:next,
    roleStreak:previousRole===next?Number(roleStreak)+1:1,
    defenseRequiredUntilReal:obligationStillPending,
  };
}

export function sortByLongestRealWait(pairs){
  return [...pairs].sort((a,b)=>{
    const ta=new Date(a.realWaitingSince).getTime();
    const tb=new Date(b.realWaitingSince).getTime();
    if(Number.isNaN(ta)||Number.isNaN(tb))throw new Error('invalid real wait');
    if(ta!==tb)return ta-tb;
    if(Number(a.position)!==Number(b.position))return Number(a.position)-Number(b.position);
    return Number(a.id)-Number(b.id);
  });
}

function defenderEligible(attacker,candidate){
  return Number(candidate.position)<Number(attacker.position)
    && candidate.role==='defense'
    && candidate.active!==false
    && candidate.free!==false;
}

export function chooseDefenderForAttacker(attacker,candidates,{lastOpponentId=null,windowSize=3}={}){
  const size=Math.max(1,Number(windowSize)||3);
  const superior=[...candidates]
    .filter(c=>defenderEligible(attacker,c))
    .sort((a,b)=>Number(b.position)-Number(a.position));
  if(!superior.length)return null;

  if(attacker.relegationActive){
    const ordered=[...superior].sort((a,b)=>Number(b.position)-Number(a.position));
    const desiredIndex=Math.min(Math.max(0,Number(attacker.relegationRouteStep)||0),ordered.length-1);
    const desired=ordered[desiredIndex];
    if(lastOpponentId==null||Number(desired.id)!==Number(lastOpponentId)||ordered.length===1)return desired;
    const harder=ordered.slice(desiredIndex+1).find(c=>Number(c.id)!==Number(lastOpponentId));
    if(harder)return harder;
    const anyOther=ordered.find(c=>Number(c.id)!==Number(lastOpponentId));
    return anyOther||desired;
  }

  const maxDistance=Number(attacker.position)-Math.min(...superior.map(c=>Number(c.position)));
  const freshSuperior=lastOpponentId==null
    ?superior
    :superior.filter(c=>Number(c.id)!==Number(lastOpponentId));
  const preferredPool=freshSuperior.length?freshSuperior:superior;

  for(let limit=size;limit<=maxDistance+size;limit+=size){
    const window=preferredPool.filter(c=>Number(attacker.position)-Number(c.position)<=limit);
    if(!window.length)continue;
    return sortByLongestRealWait(window)[0];
  }
  return null;
}

export function assignAttackersToDefenders(pairs,{lastOpponentByPair={}}={}){
  const attackers=sortByLongestRealWait(pairs.filter(p=>p.role==='attack'&&p.active!==false&&p.free!==false));
  const available=new Map(pairs.filter(p=>p.role==='defense'&&p.active!==false&&p.free!==false).map(p=>[Number(p.id),p]));
  const assignments=[];
  for(const attacker of attackers){
    const defender=chooseDefenderForAttacker(attacker,[...available.values()],{
      lastOpponentId:lastOpponentByPair[attacker.id]??null,
    });
    if(!defender)continue;
    assignments.push({attackerId:Number(attacker.id),defenderId:Number(defender.id)});
    available.delete(Number(defender.id));
  }
  return assignments;
}

export function rebalanceInitialRoles(pairs){
  if(!Array.isArray(pairs)||pairs.length===0)return [];
  const ordered=[...pairs].sort((a,b)=>Number(a.position)-Number(b.position));
  if(ordered.length===1)return [{...ordered[0],role:null,roleStreak:0}];

  const out=ordered.map(pair=>({...pair}));
  out[0].role='defense';
  out[0].roleStreak=ordered[0].role==='defense'?Math.max(1,Number(ordered[0].roleStreak)||0):1;
  out.at(-1).role='attack';
  out.at(-1).roleStreak=ordered.at(-1).role==='attack'?Math.max(1,Number(ordered.at(-1).roleStreak)||0):1;

  let attacks=1,defenses=1;
  for(let index=1;index<out.length-1;index++){
    const pair=out[index];
    const role=pair.defenseRequiredUntilReal?'defense':attacks<=defenses?'attack':'defense';
    pair.roleStreak=ordered[index].role===role?Math.max(1,Number(ordered[index].roleStreak)||0):1;
    pair.role=role;
    if(role==='attack')attacks++;else defenses++;
  }
  return out;
}


export const WHEEL_V3_TARGET_SHARE=1/7;

export function entryPositionPenultimate(activeCount){
  const n=Number(activeCount);
  if(!Number.isInteger(n)||n<0)throw new Error('activeCount must be a non-negative integer');
  if(n===0)return 1;
  if(n===1)return 2;
  return n;
}

export function populationMoveImprovesBalance(counts,srcIndex,dstIndex){
  const values=counts.map(Number);
  const total=values.reduce((s,n)=>s+n,0);
  if(total<=0||values[srcIndex]<=0)return false;
  const dev=(a,b)=>Math.abs(a/total-WHEEL_V3_TARGET_SHARE)+Math.abs(b/total-WHEEL_V3_TARGET_SHARE);
  const before=dev(values[srcIndex],values[dstIndex]);
  const after=dev(values[srcIndex]-1,values[dstIndex]+1);
  return after<=before+1e-12;
}

export function populationDirectionalThreshold(counts,srcIndex,dstIndex){
  const values=counts.map(Number);
  const total=values.reduce((s,n)=>s+n,0);
  if(total<=0||values[srcIndex]<=0)return 3;
  if(!populationMoveImprovesBalance(values,srcIndex,dstIndex))return 3;
  const src=values[srcIndex]/total,dst=values[dstIndex]/total;
  let need=3;
  if(src>0.22)need=1;
  else if(src>0.19)need=2;
  if(dst<0.07)need=Math.min(need,1);
  else if(dst<0.10)need=Math.min(need,2);
  return need;
}

export function delayedResultMovement({winnerPosition,loserPosition}){
  if(Number(winnerPosition)>Number(loserPosition)){
    return {winnerPosition:Number(loserPosition),loserPosition:Number(winnerPosition),moved:true};
  }
  return {winnerPosition:Number(winnerPosition),loserPosition:Number(loserPosition),moved:false};
}


export function promotionStateAfterResult({
  category,
  position,
  activeCount,
  currentWins=0,
  isRealMatch,
  won,
  threshold=3,
  awaitingFirstMatch=false,
  wasNumberOneBefore=true,
}){
  const c=Number(category),pos=Number(position),n=Number(activeCount),wins=Number(currentWins),need=Number(threshold);
  if(c<=1||pos!==1)return {active:false,wins:0,promote:false,awaitingFirstMatch:false};
  if(awaitingFirstMatch){
    if(!isRealMatch)return {active:false,wins:0,promote:false,awaitingFirstMatch:true};
    return {active:true,wins:0,promote:false,awaitingFirstMatch:false};
  }
  if(!wasNumberOneBefore)return {active:true,wins:0,promote:false,awaitingFirstMatch:false};
  if(!isRealMatch)return {active:true,wins,promote:false,awaitingFirstMatch:false};
  if(!won)return {active:false,wins:0,promote:false,awaitingFirstMatch:false};
  const next=wins+1;
  return {active:true,wins:next,promote:next>=need,awaitingFirstMatch:false};
}

export function relegationStateAfterResult({
  category,
  wasInRelegation,
  losses=0,
  routeStep=0,
  isRealMatch,
  won,
  ownFailure=false,
  isLast,
  threshold=3,
  awaitingFirstMatch=false,
}){
  const c=Number(category),count=Number(losses),route=Number(routeStep),need=Number(threshold);
  if(c>=7)return {active:false,losses:0,routeStep:0,descend:false,awaitingFirstMatch:false};
  if(awaitingFirstMatch){
    if(!isRealMatch)return {active:false,losses:0,routeStep:0,descend:false,awaitingFirstMatch:true};
    if(!isLast)return {active:false,losses:0,routeStep:0,descend:false,awaitingFirstMatch:false};
    return {active:true,losses:0,routeStep:0,descend:false,awaitingFirstMatch:false};
  }
  const active=Boolean(wasInRelegation)||Boolean(isLast);
  if(!active)return {active:false,losses:0,routeStep:0,descend:false,awaitingFirstMatch:false};
  if(!wasInRelegation&&isLast)return {active:true,losses:0,routeStep:0,descend:Boolean(ownFailure),awaitingFirstMatch:false};
  if(ownFailure&&isLast)return {active:true,losses:count+1,routeStep:route,descend:true,awaitingFirstMatch:false};
  if(isRealMatch&&won)return {active:false,losses:0,routeStep:0,descend:false,awaitingFirstMatch:false};
  if(isRealMatch&&!won){
    const next=count+1;
    return {active:true,losses:next,routeStep:route+1,descend:next>=need,awaitingFirstMatch:false};
  }
  if(ownFailure){
    const next=count+1;
    return {active:true,losses:next,routeStep:route,descend:next>=need,awaitingFirstMatch:false};
  }
  return {active:true,losses:count,routeStep:route,descend:false,awaitingFirstMatch:false};
}

export function failureStateAfterClosure({
  failureStreak=0,
  ownFailure=false,
  rivalOnlyFailure=false,
  realMatch=false,
  automaticCancellation=false,
}){
  const streak=Number(failureStreak);
  if(automaticCancellation)return {failureStreak:streak,penalty30Days:false};
  if(ownFailure){
    const next=streak+1;
    return {failureStreak:next,penalty30Days:next>=3};
  }
  if(realMatch||rivalOnlyFailure)return {failureStreak:0,penalty30Days:false};
  return {failureStreak:streak,penalty30Days:false};
}

export function roleAfterOwnFailure({
  previousRole,
  position,
  activeCount,
}){
  const forced=forcedRoleForPosition({position,activeCount});
  if(forced==='attack'){
    return {role:'attack',defenseRequiredUntilReal:false};
  }
  return {role:'defense',defenseRequiredUntilReal:true};
}

export function administrativeFailureMovement({failingPosition,rivalPosition}){
  const failing=Number(failingPosition),rival=Number(rivalPosition);
  if(failing<rival)return {failingPosition:rival,rivalPosition:failing,moved:true};
  return {failingPosition:failing,rivalPosition:rival,moved:false};
}

export function relegationAttackTarget({
  attackerPosition,
  defenderPositions,
  routeStep=0,
}){
  const attacker=Number(attackerPosition),step=Math.max(0,Number(routeStep)||0);
  const eligible=[...defenderPositions].map(Number).filter(p=>p<attacker).sort((a,b)=>b-a);
  if(!eligible.length)return null;
  const index=Math.min(step,eligible.length-1);
  return eligible[index];
}

export function shouldCancelAssignmentForStructure({
  hasFirstResult,
  attackerCategory,
  defenderCategory,
  attackerPosition,
  defenderPosition,
}){
  if(hasFirstResult)return false;
  if(Number(attackerCategory)!==Number(defenderCategory))return true;
  return Number(attackerPosition)<=Number(defenderPosition);
}


export function descendedEntryPosition(activeCount){
  const n=Number(activeCount);
  if(!Number.isInteger(n)||n<0)throw new Error('activeCount must be a non-negative integer');
  return n===0?1:2;
}

export function firstPlaceReignAfterResult({
  category,
  wasNumberOne,
  remainsNumberOne,
  isRealMatch,
  countsAsDefense=isRealMatch,
  currentDefenses=0,
}){
  const c=Number(category),defenses=Number(currentDefenses);
  if(c!==1)return {open:false,defenses:0,ended:false,defended:false};
  if(!wasNumberOne&&remainsNumberOne)return {open:true,defenses:0,ended:false,defended:false};
  if(wasNumberOne&&!remainsNumberOne)return {open:false,defenses,ended:true,defended:false};
  if(wasNumberOne&&remainsNumberOne&&countsAsDefense)return {open:true,defenses:defenses+1,ended:false,defended:true};
  return {open:Boolean(remainsNumberOne),defenses,ended:false,defended:false};
}

export function inactivityStateOnPause({position,nowValue,reason='voluntary',penaltyDays=30}){
  const pos=Number(position),now=new Date(nowValue);
  if(!Number.isInteger(pos)||pos<1||Number.isNaN(now.getTime()))throw new Error('invalid inactivity state');
  if(!['voluntary','three_failures'].includes(reason))throw new Error('invalid inactivity reason');
  return {
    inactiveSince:now,
    returnPositionBase:pos,
    inactiveReason:reason,
    autoReactivateAt:reason==='three_failures'?new Date(now.getTime()+Number(penaltyDays)*24*60*60*1000):null,
  };
}

export function canAutoReactivate({inactiveReason,autoReactivateAt,serverNow}){
  if(inactiveReason!=='three_failures'||!autoReactivateAt)return false;
  const until=new Date(autoReactivateAt),now=new Date(serverNow);
  if(Number.isNaN(until.getTime())||Number.isNaN(now.getTime()))throw new Error('invalid reactivation dates');
  return now>=until;
}

export function reviewDeadlineFromFirstResult(serverNowValue){
  return deadlineFromServerTime(serverNowValue,7);
}

export function assignmentDeadlineFromServerTime(serverNowValue){
  return deadlineFromServerTime(serverNowValue,30);
}

export function noShowReconsiderationDeadline(serverNowValue){
  const now=new Date(serverNowValue);
  if(Number.isNaN(now.getTime()))throw new Error('invalid no-show time');
  return new Date(now.getTime()+48*60*60*1000);
}

export function resultCountsAsReal(resultType){
  return resultType==='normal'||resultType==='injury_abandonment';
}

export function simultaneousOnePlacePenalty(order,penalizedIds,debt={}){
  const out=[...order].map(Number);
  const penalized=new Set([...penalizedIds].map(Number));
  const nextDebt={...debt};
  let i=0;
  while(i<out.length){
    if(!penalized.has(out[i])){i++;continue;}
    let j=i;
    while(j+1<out.length&&penalized.has(out[j+1]))j++;
    if(j+1<out.length){
      const next=out[j+1];
      out.splice(j+1,1);
      out.splice(i,0,next);
      i=j+2;
    }else{
      for(let k=i;k<=j;k++){
        const id=out[k];
        nextDebt[id]=Number(nextDebt[id]||0)+1;
      }
      break;
    }
  }
  return {order:out,debt:nextDebt};
}


export function normalizeRolesForPlanning(pairs){
  const active=[...pairs].filter(p=>p.active!==false).sort((a,b)=>Number(a.position)-Number(b.position));
  if(active.length===0)return [];
  if(active.length===1){
    const only={...active[0]};
    if(only.free!==false){only.role=null;only.roleStreak=0;}
    return [only];
  }

  const output=active.map(p=>({...p}));
  const actualTop=output[0];
  const actualBottom=output.at(-1);

  if(actualTop.free!==false){
    actualTop.role='defense';
    actualTop.roleStreak=active[0].role==='defense'?Math.max(1,Number(active[0].roleStreak)||0):1;
  }
  if(actualBottom.free!==false){
    actualBottom.role='attack';
    actualBottom.roleStreak=active.at(-1).role==='attack'?Math.max(1,Number(active.at(-1).roleStreak)||0):1;
  }

  const free=output.filter(p=>p.free!==false);
  let attackCount=free.filter(p=>p.role==='attack').length;
  let defenseCount=free.filter(p=>p.role==='defense').length;

  for(const pair of free){
    if(pair===actualTop||pair===actualBottom)continue;
    if(pair.defenseRequiredUntilReal){
      if(pair.role!=='defense'){
        pair.role='defense';
        pair.roleStreak=1;
        defenseCount++;
      }
      continue;
    }
    if(pair.role==='attack'||pair.role==='defense')continue;
    pair.role=attackCount<=defenseCount?'attack':'defense';
    pair.roleStreak=1;
    if(pair.role==='attack')attackCount++;else defenseCount++;
  }
  return output;
}

export function planCategoryWheel(pairs,{lastOpponentByPair={}}={}){
  const normalized=normalizeRolesForPlanning(pairs);
  return {
    pairs:normalized,
    assignments:assignAttackersToDefenders(normalized,{lastOpponentByPair}),
  };
}
