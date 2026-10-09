import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pairKey,
  individualCategoriesAfterDescent,
  categoryForReformedPair,
  shouldResetPairFailures,
  zoneAfterFormation,
  inactivityReturnPosition,
  recordReign,
  fullCalendarMonthsBetween,
  resultAllowedAfterCancellation,
  deadlineFromServerTime,
  formationComplete,
  forcedRoleForPosition,
  roleAfterRealMatch,
  sortByLongestRealWait,
  chooseDefenderForAttacker,
  assignAttackersToDefenders,
  rebalanceInitialRoles,
  entryPositionPenultimate,
  populationMoveImprovesBalance,
  populationDirectionalThreshold,
  delayedResultMovement,
  promotionStateAfterResult,
  relegationStateAfterResult,
  failureStateAfterClosure,
  roleAfterOwnFailure,
  administrativeFailureMovement,
  relegationAttackTarget,
  shouldCancelAssignmentForStructure,
  descendedEntryPosition,
  firstPlaceReignAfterResult,
  inactivityStateOnPause,
  canAutoReactivate,
  reviewDeadlineFromFirstResult,
  assignmentDeadlineFromServerTime,
  noShowReconsiderationDeadline,
  resultCountsAsReal,
  simultaneousOnePlacePenalty,
  normalizeRolesForPlanning,
  planCategoryWheel,
} from '../scripts/wheel-v3-rule-model.js';

test('pair anti-abuse state follows the exact two people regardless of order',()=>{
  assert.equal(pairKey(20,7),'7:20');
  assert.equal(pairKey(7,20),'7:20');
});

test('real descent updates only individual categories that were above the new level',()=>{
  assert.deepEqual(individualCategoriesAfterDescent([2,5],3),[3,5]);
  assert.deepEqual(individualCategoriesAfterDescent([1,2],3),[3,3]);
  assert.deepEqual(individualCategoriesAfterDescent([4,6],5),[5,6]);
});

test('pending descent category overrides later individual-category improvements until resolved',()=>{
  assert.equal(categoryForReformedPair({memberCategories:[2,5],pendingDescentCategory:4}),4);
  assert.equal(categoryForReformedPair({memberCategories:[2,5]}),2);
});

test('automatic cancellation does not clean consecutive failures',()=>{
  assert.equal(shouldResetPairFailures('system_ranking_cancel'),false);
  assert.equal(shouldResetPairFailures('system_category_cancel'),false);
  assert.equal(shouldResetPairFailures('real_match_resolved'),true);
  assert.equal(shouldResetPairFailures('rival_only_failure'),true);
});

test('first match for a zero-PJ edge pair only unlocks a 0/3 zone',()=>{
  assert.deepEqual(
    zoneAfterFormation({category:3,position:1,activeCount:8,realMatchesBefore:0}),
    {zone:'awaiting_first_match',count:0},
  );
  assert.deepEqual(
    zoneAfterFormation({category:3,position:1,activeCount:8,realMatchesBefore:0,firstMatchJustClosed:true}),
    {zone:'promotion',count:0},
  );
  assert.deepEqual(
    zoneAfterFormation({category:4,position:8,activeCount:8,realMatchesBefore:0,firstMatchJustClosed:true}),
    {zone:'relegation',count:0},
  );
  assert.deepEqual(
    zoneAfterFormation({category:7,position:8,activeCount:8,realMatchesBefore:4}),
    {zone:null,count:0},
  );
});

test('inactivity return preserves three months then loses one place per full month',()=>{
  assert.equal(inactivityReturnPosition({originalPosition:5,fullMonths:3,activeCount:12}),5);
  assert.equal(inactivityReturnPosition({originalPosition:5,fullMonths:6,activeCount:12}),8);
  assert.equal(inactivityReturnPosition({originalPosition:1,fullMonths:2,activeCount:12}),2);
  assert.equal(inactivityReturnPosition({originalPosition:1,fullMonths:6,activeCount:12}),5);
  assert.equal(inactivityReturnPosition({originalPosition:8,fullMonths:20,activeCount:9}),10);
});

test('First-place historical record is per reign and can be shared',()=>{
  assert.deepEqual(recordReign({currentDefenses:8,historicalMax:7}),{historicalMax:8,status:'new_record'});
  assert.deepEqual(recordReign({currentDefenses:8,historicalMax:8}),{historicalMax:8,status:'shared_record'});
  assert.deepEqual(recordReign({currentDefenses:3,historicalMax:8}),{historicalMax:8,status:'below_record'});
});


test('inactivity uses complete calendar months instead of fixed 30-day blocks',()=>{
  assert.equal(fullCalendarMonthsBetween('2026-01-31T15:00:00Z','2026-02-28T14:59:59Z'),0);
  assert.equal(fullCalendarMonthsBetween('2026-01-31T15:00:00Z','2026-02-28T15:00:00Z'),1);
  assert.equal(fullCalendarMonthsBetween('2026-01-31T15:00:00Z','2026-04-30T15:00:00Z'),3);
  assert.equal(fullCalendarMonthsBetween('2026-01-31T15:00:00Z','2026-05-31T15:00:00Z'),4);
});

test('late result is admissible only when the match was played before cancellation',()=>{
  assert.equal(resultAllowedAfterCancellation({
    playedAt:'2026-09-20T18:00:00Z',
    cancelledAt:'2026-09-21T18:00:00Z',
  }),true);
  assert.equal(resultAllowedAfterCancellation({
    playedAt:'2026-09-22T18:00:00Z',
    cancelledAt:'2026-09-21T18:00:00Z',
  }),false);
  assert.equal(resultAllowedAfterCancellation({
    playedAt:'2026-09-22T18:00:00Z',
    cancelledAt:null,
  }),true);
});

test('authoritative deadline contracts are absolute durations from server time',()=>{
  assert.equal(
    deadlineFromServerTime('2026-09-28T06:00:00Z',7).toISOString(),
    '2026-10-05T06:00:00.000Z',
  );
  assert.equal(
    deadlineFromServerTime('2026-09-28T06:00:00Z',30).toISOString(),
    '2026-10-28T06:00:00.000Z',
  );
});


test('formation completes only when all seven categories have at least five active pairs',()=>{
  assert.equal(formationComplete([5,5,5,5,5,5,5]),true);
  assert.equal(formationComplete([5,5,4,12,5,8,7]),false);
  assert.throws(()=>formationComplete([5,5,5]));
});

test('ladder extremes force defense for #1 and attack for the bottom',()=>{
  assert.equal(forcedRoleForPosition({position:1,activeCount:8}),'defense');
  assert.equal(forcedRoleForPosition({position:8,activeCount:8}),'attack');
  assert.equal(forcedRoleForPosition({position:4,activeCount:8}),null);
  assert.equal(forcedRoleForPosition({position:1,activeCount:1}),null);
});

test('real match normally flips attacker to defense and defender to attack',()=>{
  assert.deepEqual(
    roleAfterRealMatch({previousRole:'attack',wasAttacker:true,roleStreak:2,position:4,activeCount:8}),
    {role:'defense',roleStreak:1,defenseRequiredUntilReal:false},
  );
  assert.deepEqual(
    roleAfterRealMatch({previousRole:'defense',wasAttacker:false,roleStreak:1,position:4,activeCount:8}),
    {role:'attack',roleStreak:1,defenseRequiredUntilReal:false},
  );
});

test('extreme position overrides the normal post-match role',()=>{
  assert.deepEqual(
    roleAfterRealMatch({previousRole:'attack',wasAttacker:true,roleStreak:1,position:8,activeCount:8,defenseRequiredUntilReal:true}),
    {role:'attack',roleStreak:2,defenseRequiredUntilReal:false},
  );
  assert.deepEqual(
    roleAfterRealMatch({previousRole:'attack',wasAttacker:false,roleStreak:1,position:1,activeCount:8}),
    {role:'defense',roleStreak:1,defenseRequiredUntilReal:false},
  );
  assert.deepEqual(
    roleAfterRealMatch({previousRole:'defense',wasAttacker:false,roleStreak:2,position:1,activeCount:8,defenseRequiredUntilReal:true}),
    {role:'defense',roleStreak:3,defenseRequiredUntilReal:false},
  );
});

test('longest real wait is the primary ordering key',()=>{
  const ordered=sortByLongestRealWait([
    {id:3,position:5,realWaitingSince:'2026-09-20T00:00:00Z'},
    {id:2,position:7,realWaitingSince:'2026-09-10T00:00:00Z'},
    {id:1,position:6,realWaitingSince:'2026-09-10T00:00:00Z'},
  ]);
  assert.deepEqual(ordered.map(x=>x.id),[1,2,3]);
});

test('attacker searches only upward and prefers longest-waiting defender inside first 3-position window',()=>{
  const attacker={id:8,position:8,role:'attack',active:true,free:true,realWaitingSince:'2026-09-01T00:00:00Z'};
  const defender=chooseDefenderForAttacker(attacker,[
    {id:7,position:7,role:'defense',active:true,free:true,realWaitingSince:'2026-09-27T00:00:00Z'},
    {id:6,position:6,role:'defense',active:true,free:true,realWaitingSince:'2026-09-16T00:00:00Z'},
    {id:5,position:5,role:'defense',active:true,free:true,realWaitingSince:'2026-09-08T00:00:00Z'},
    {id:9,position:9,role:'defense',active:true,free:true,realWaitingSince:'2026-08-01T00:00:00Z'},
  ]);
  assert.equal(defender.id,5);
});

test('attacker expands the search immediately in blocks of three when needed',()=>{
  const attacker={id:9,position:9,role:'attack',active:true,free:true,realWaitingSince:'2026-09-01T00:00:00Z'};
  const defender=chooseDefenderForAttacker(attacker,[
    {id:8,position:8,role:'attack',active:true,free:true,realWaitingSince:'2026-09-01T00:00:00Z'},
    {id:7,position:7,role:'attack',active:true,free:true,realWaitingSince:'2026-09-01T00:00:00Z'},
    {id:6,position:6,role:'attack',active:true,free:true,realWaitingSince:'2026-09-01T00:00:00Z'},
    {id:5,position:5,role:'defense',active:true,free:true,realWaitingSince:'2026-09-02T00:00:00Z'},
  ]);
  assert.equal(defender.id,5);
});

test('immediate opponent repeat is avoided when a reasonable alternative exists',()=>{
  const attacker={id:8,position:8,role:'attack',active:true,free:true,realWaitingSince:'2026-09-01T00:00:00Z'};
  const defender=chooseDefenderForAttacker(attacker,[
    {id:7,position:7,role:'defense',active:true,free:true,realWaitingSince:'2026-09-01T00:00:00Z'},
    {id:6,position:6,role:'defense',active:true,free:true,realWaitingSince:'2026-09-10T00:00:00Z'},
  ],{lastOpponentId:7});
  assert.equal(defender.id,6);
});

test('repeat opponent never blocks the wheel if there is no alternative',()=>{
  const attacker={id:8,position:8,role:'attack',active:true,free:true,realWaitingSince:'2026-09-01T00:00:00Z'};
  const defender=chooseDefenderForAttacker(attacker,[
    {id:7,position:7,role:'defense',active:true,free:true,realWaitingSince:'2026-09-01T00:00:00Z'},
  ],{lastOpponentId:7});
  assert.equal(defender.id,7);
});

test('collision for the same defender is won by the attacker with the longest wait',()=>{
  const assignments=assignAttackersToDefenders([
    {id:10,position:10,role:'attack',active:true,free:true,realWaitingSince:'2026-09-01T00:00:00Z'},
    {id:9,position:9,role:'attack',active:true,free:true,realWaitingSince:'2026-09-05T00:00:00Z'},
    {id:8,position:8,role:'defense',active:true,free:true,realWaitingSince:'2026-09-10T00:00:00Z'},
    {id:6,position:6,role:'defense',active:true,free:true,realWaitingSince:'2026-09-20T00:00:00Z'},
  ]);
  assert.deepEqual(assignments[0],{attackerId:10,defenderId:8});
  assert.deepEqual(assignments[1],{attackerId:9,defenderId:6});
});

test('initial role rebalance keeps extremes forced and roughly balances the middle',()=>{
  const rows=rebalanceInitialRoles([
    {id:1,position:1,role:null,roleStreak:0},
    {id:2,position:2,role:null,roleStreak:0},
    {id:3,position:3,role:null,roleStreak:0},
    {id:4,position:4,role:null,roleStreak:0},
    {id:5,position:5,role:null,roleStreak:0},
    {id:6,position:6,role:null,roleStreak:0},
  ]);
  assert.equal(rows[0].role,'defense');
  assert.equal(rows.at(-1).role,'attack');
  const attack=rows.filter(x=>x.role==='attack').length;
  const defense=rows.filter(x=>x.role==='defense').length;
  assert.ok(Math.abs(attack-defense)<=1);
});

test('one active pair has no effective role',()=>{
  const rows=rebalanceInitialRoles([{id:1,position:1,role:'defense',roleStreak:2}]);
  assert.deepEqual(rows,[{id:1,position:1,role:null,roleStreak:0}]);
});


test('new and promoted pairs enter penultimate, preserving the only leader at N=1',()=>{
  assert.equal(entryPositionPenultimate(0),1);
  assert.equal(entryPositionPenultimate(1),2);
  assert.equal(entryPositionPenultimate(2),2);
  assert.equal(entryPositionPenultimate(10),10);
});

test('population acceleration only applies when the adjacent move improves joint balance',()=>{
  assert.equal(populationMoveImprovesBalance([12,12,12,12,12,12,12],3,4),false);
  assert.equal(populationMoveImprovesBalance([20,12,12,12,12,8,8],0,1),true);
  assert.equal(populationMoveImprovesBalance([8,8,12,12,12,12,20],6,5),true);
});

test('population threshold is 3 in normal balance and can drop to 2 or 1 directionally',()=>{
  assert.equal(populationDirectionalThreshold([12,12,12,12,12,12,12],3,4),3);
  assert.equal(populationDirectionalThreshold([17,12,12,12,12,10,9],0,1),2);
  assert.equal(populationDirectionalThreshold([20,12,12,12,12,8,8],0,1),1);
  assert.equal(populationDirectionalThreshold([8,8,12,12,12,12,20],6,5),1);
});

test('delayed confirmed result never moves the winner downward',()=>{
  assert.deepEqual(
    delayedResultMovement({winnerPosition:8,loserPosition:4}),
    {winnerPosition:4,loserPosition:8,moved:true},
  );
  assert.deepEqual(
    delayedResultMovement({winnerPosition:3,loserPosition:7}),
    {winnerPosition:3,loserPosition:7,moved:false},
  );
});


test('promotion zone counts only real wins and resets when #1 is lost',()=>{
  assert.deepEqual(
    promotionStateAfterResult({category:3,position:1,activeCount:8,currentWins:1,isRealMatch:true,won:true,threshold:3}),
    {active:true,wins:2,promote:false,awaitingFirstMatch:false},
  );
  assert.deepEqual(
    promotionStateAfterResult({category:3,position:1,activeCount:8,currentWins:2,isRealMatch:true,won:true,threshold:3}),
    {active:true,wins:3,promote:true,awaitingFirstMatch:false},
  );
  assert.deepEqual(
    promotionStateAfterResult({category:3,position:1,activeCount:8,currentWins:2,isRealMatch:false,won:true,threshold:3}),
    {active:true,wins:2,promote:false,awaitingFirstMatch:false},
  );
  assert.deepEqual(
    promotionStateAfterResult({category:3,position:2,activeCount:8,currentWins:2,isRealMatch:true,won:false,threshold:3}),
    {active:false,wins:0,promote:false,awaitingFirstMatch:false},
  );
});

test('formation enabling match opens zone at zero without counting that result',()=>{
  assert.deepEqual(
    promotionStateAfterResult({category:4,position:1,activeCount:8,currentWins:0,isRealMatch:true,won:true,threshold:3,awaitingFirstMatch:true}),
    {active:true,wins:0,promote:false,awaitingFirstMatch:false},
  );
  assert.deepEqual(
    relegationStateAfterResult({category:4,wasInRelegation:false,losses:0,routeStep:0,isRealMatch:true,won:false,isLast:true,threshold:3,awaitingFirstMatch:true}),
    {active:true,losses:0,routeStep:0,descend:false,awaitingFirstMatch:false},
  );
});

test('relegation survives movement away from last and exits only on a real win',()=>{
  assert.deepEqual(
    relegationStateAfterResult({category:4,wasInRelegation:true,losses:1,routeStep:1,isRealMatch:false,won:true,isLast:false,threshold:3}),
    {active:true,losses:1,routeStep:1,descend:false,awaitingFirstMatch:false},
  );
  assert.deepEqual(
    relegationStateAfterResult({category:4,wasInRelegation:true,losses:1,routeStep:1,isRealMatch:true,won:true,isLast:false,threshold:3}),
    {active:false,losses:0,routeStep:0,descend:false,awaitingFirstMatch:false},
  );
});

test('real relegation losses advance both count and difficulty route',()=>{
  assert.deepEqual(
    relegationStateAfterResult({category:5,wasInRelegation:true,losses:1,routeStep:1,isRealMatch:true,won:false,isLast:false,threshold:3}),
    {active:true,losses:2,routeStep:2,descend:false,awaitingFirstMatch:false},
  );
  assert.deepEqual(
    relegationStateAfterResult({category:5,wasInRelegation:true,losses:2,routeStep:2,isRealMatch:true,won:false,isLast:false,threshold:3}),
    {active:true,losses:3,routeStep:3,descend:true,awaitingFirstMatch:false},
  );
});

test('last active pair own failure causes direct relegation except in seventh',()=>{
  assert.equal(
    relegationStateAfterResult({category:3,wasInRelegation:true,losses:0,routeStep:0,isRealMatch:false,won:false,ownFailure:true,isLast:true,threshold:3}).descend,
    true,
  );
  assert.deepEqual(
    relegationStateAfterResult({category:7,wasInRelegation:false,losses:0,routeStep:0,isRealMatch:false,won:false,ownFailure:true,isLast:true,threshold:3}),
    {active:false,losses:0,routeStep:0,descend:false,awaitingFirstMatch:false},
  );
});

test('population threshold reduction never descends without a new result',()=>{
  assert.deepEqual(
    relegationStateAfterResult({category:4,wasInRelegation:true,losses:2,routeStep:2,isRealMatch:false,won:false,isLast:false,threshold:1}),
    {active:true,losses:2,routeStep:2,descend:false,awaitingFirstMatch:false},
  );
});

test('failure streak belongs to the duo and penalizes on the third attributable failure',()=>{
  assert.deepEqual(
    failureStateAfterClosure({failureStreak:2,ownFailure:true}),
    {failureStreak:3,penalty30Days:true},
  );
  assert.deepEqual(
    failureStateAfterClosure({failureStreak:2,automaticCancellation:true}),
    {failureStreak:2,penalty30Days:false},
  );
  assert.deepEqual(
    failureStateAfterClosure({failureStreak:2,rivalOnlyFailure:true}),
    {failureStreak:0,penalty30Days:false},
  );
  assert.deepEqual(
    failureStateAfterClosure({failureStreak:2,realMatch:true}),
    {failureStreak:0,penalty30Days:false},
  );
});

test('own failure imposes defense unless the pair is structurally forced to attack',()=>{
  assert.deepEqual(
    roleAfterOwnFailure({previousRole:'attack',position:4,activeCount:8}),
    {role:'defense',defenseRequiredUntilReal:true},
  );
  assert.deepEqual(
    roleAfterOwnFailure({previousRole:'defense',position:8,activeCount:8}),
    {role:'attack',defenseRequiredUntilReal:false},
  );
});

test('administrative failure can only move the violator downward',()=>{
  assert.deepEqual(
    administrativeFailureMovement({failingPosition:3,rivalPosition:6}),
    {failingPosition:6,rivalPosition:3,moved:true},
  );
  assert.deepEqual(
    administrativeFailureMovement({failingPosition:7,rivalPosition:4}),
    {failingPosition:7,rivalPosition:4,moved:false},
  );
});

test('relegation attack route starts low and climbs one step after each real loss',()=>{
  assert.equal(relegationAttackTarget({attackerPosition:8,defenderPositions:[7,6,5,4],routeStep:0}),7);
  assert.equal(relegationAttackTarget({attackerPosition:8,defenderPositions:[7,6,5,4],routeStep:1}),6);
  assert.equal(relegationAttackTarget({attackerPosition:8,defenderPositions:[7,6,5,4],routeStep:3}),4);
  assert.equal(relegationAttackTarget({attackerPosition:8,defenderPositions:[7],routeStep:9}),7);
});

test('assignment cancels only before first result when attacker is no longer below or category changes',()=>{
  assert.equal(shouldCancelAssignmentForStructure({
    hasFirstResult:false,attackerCategory:4,defenderCategory:4,attackerPosition:5,defenderPosition:4,
  }),false);
  assert.equal(shouldCancelAssignmentForStructure({
    hasFirstResult:false,attackerCategory:4,defenderCategory:4,attackerPosition:3,defenderPosition:4,
  }),true);
  assert.equal(shouldCancelAssignmentForStructure({
    hasFirstResult:false,attackerCategory:4,defenderCategory:3,attackerPosition:5,defenderPosition:4,
  }),true);
  assert.equal(shouldCancelAssignmentForStructure({
    hasFirstResult:true,attackerCategory:4,defenderCategory:3,attackerPosition:3,defenderPosition:4,
  }),false);
});


test('descended pair enters #2 unless the destination has no active leader',()=>{
  assert.equal(descendedEntryPosition(0),1);
  assert.equal(descendedEntryPosition(1),2);
  assert.equal(descendedEntryPosition(12),2);
});

test('first place record is counted per reign and only by real defenses',()=>{
  assert.deepEqual(
    firstPlaceReignAfterResult({category:1,wasNumberOne:false,remainsNumberOne:true,isRealMatch:true,currentDefenses:9}),
    {open:true,defenses:0,ended:false,defended:false},
  );
  assert.deepEqual(
    firstPlaceReignAfterResult({category:1,wasNumberOne:true,remainsNumberOne:true,isRealMatch:true,currentDefenses:2}),
    {open:true,defenses:3,ended:false,defended:true},
  );
  assert.deepEqual(
    firstPlaceReignAfterResult({category:1,wasNumberOne:true,remainsNumberOne:true,isRealMatch:false,currentDefenses:2}),
    {open:true,defenses:2,ended:false,defended:false},
  );
  assert.deepEqual(
    firstPlaceReignAfterResult({category:1,wasNumberOne:true,remainsNumberOne:false,isRealMatch:true,currentDefenses:4}),
    {open:false,defenses:4,ended:true,defended:false},
  );
});

test('three-failure inactivity gets exact 30-day server deadline while voluntary pause does not',()=>{
  const sanction=inactivityStateOnPause({
    position:5,
    nowValue:'2026-09-28T12:00:00Z',
    reason:'three_failures',
  });
  assert.equal(sanction.returnPositionBase,5);
  assert.equal(sanction.autoReactivateAt.toISOString(),'2026-10-28T12:00:00.000Z');
  const voluntary=inactivityStateOnPause({
    position:1,
    nowValue:'2026-09-28T12:00:00Z',
    reason:'voluntary',
  });
  assert.equal(voluntary.returnPositionBase,1);
  assert.equal(voluntary.autoReactivateAt,null);
});

test('automatic reactivation happens exactly when server time reaches penalty deadline',()=>{
  assert.equal(canAutoReactivate({
    inactiveReason:'three_failures',
    autoReactivateAt:'2026-10-28T12:00:00Z',
    serverNow:'2026-10-28T11:59:59Z',
  }),false);
  assert.equal(canAutoReactivate({
    inactiveReason:'three_failures',
    autoReactivateAt:'2026-10-28T12:00:00Z',
    serverNow:'2026-10-28T12:00:00Z',
  }),true);
  assert.equal(canAutoReactivate({
    inactiveReason:'voluntary',
    autoReactivateAt:null,
    serverNow:'2026-12-01T12:00:00Z',
  }),false);
});

test('official operational deadlines derive from server time',()=>{
  assert.equal(assignmentDeadlineFromServerTime('2026-09-28T10:00:00Z').toISOString(),'2026-10-28T10:00:00.000Z');
  assert.equal(reviewDeadlineFromFirstResult('2026-09-28T10:00:00Z').toISOString(),'2026-10-05T10:00:00.000Z');
  assert.equal(noShowReconsiderationDeadline('2026-09-28T10:00:00Z').toISOString(),'2026-09-30T10:00:00.000Z');
});

test('injury after match start is real while administrative forfeit is not',()=>{
  assert.equal(resultCountsAsReal('normal'),true);
  assert.equal(resultCountsAsReal('injury_abandonment'),true);
  assert.equal(resultCountsAsReal('dissolution_forfeit'),false);
  assert.equal(resultCountsAsReal('administrative_forfeit'),false);
});

test('simultaneous ordinary penalty makes each pair lose exactly one effective place',()=>{
  assert.deepEqual(
    simultaneousOnePlacePenalty([1,2,3,4,5,6,7,8],[5,6]),
    {order:[1,2,3,4,7,5,6,8],debt:{}},
  );
  assert.deepEqual(
    simultaneousOnePlacePenalty([1,2,3,4,5,6],[5,6]),
    {order:[1,2,3,4,5,6],debt:{5:1,6:1}},
  );
});


test('formation enabling relegation match only opens the zone if pair remains last',()=>{
  assert.deepEqual(
    relegationStateAfterResult({
      category:4,
      wasInRelegation:false,
      losses:0,
      routeStep:0,
      isRealMatch:true,
      won:true,
      isLast:false,
      threshold:3,
      awaitingFirstMatch:true,
    }),
    {active:false,losses:0,routeStep:0,descend:false,awaitingFirstMatch:false},
  );
});


test('role planning preserves mandatory defense and forced extremes',()=>{
  const rows=normalizeRolesForPlanning([
    {id:1,position:1,role:'attack',roleStreak:2,defenseRequiredUntilReal:false,active:true,free:true,realWaitingSince:'2026-09-01T00:00:00Z'},
    {id:2,position:2,role:'attack',roleStreak:3,defenseRequiredUntilReal:true,active:true,free:true,realWaitingSince:'2026-09-02T00:00:00Z'},
    {id:3,position:3,role:null,roleStreak:0,defenseRequiredUntilReal:false,active:true,free:true,realWaitingSince:'2026-09-03T00:00:00Z'},
    {id:4,position:4,role:'defense',roleStreak:3,defenseRequiredUntilReal:false,active:true,free:true,realWaitingSince:'2026-09-04T00:00:00Z'},
    {id:5,position:5,role:'defense',roleStreak:2,defenseRequiredUntilReal:false,active:true,free:true,realWaitingSince:'2026-09-05T00:00:00Z'},
  ]);
  assert.equal(rows[0].role,'defense');
  assert.equal(rows[1].role,'defense');
  assert.equal(rows.at(-1).role,'attack');
});

test('category planner normalizes roles and produces non-overlapping assignments',()=>{
  const plan=planCategoryWheel([
    {id:1,position:1,role:null,roleStreak:0,defenseRequiredUntilReal:false,active:true,free:true,realWaitingSince:'2026-09-01T00:00:00Z'},
    {id:2,position:2,role:null,roleStreak:0,defenseRequiredUntilReal:false,active:true,free:true,realWaitingSince:'2026-09-02T00:00:00Z'},
    {id:3,position:3,role:null,roleStreak:0,defenseRequiredUntilReal:false,active:true,free:true,realWaitingSince:'2026-09-03T00:00:00Z'},
    {id:4,position:4,role:null,roleStreak:0,defenseRequiredUntilReal:false,active:true,free:true,realWaitingSince:'2026-09-04T00:00:00Z'},
    {id:5,position:5,role:null,roleStreak:0,defenseRequiredUntilReal:false,active:true,free:true,realWaitingSince:'2026-09-05T00:00:00Z'},
    {id:6,position:6,role:null,roleStreak:0,defenseRequiredUntilReal:false,active:true,free:true,realWaitingSince:'2026-09-06T00:00:00Z'},
  ]);
  const used=new Set();
  for(const a of plan.assignments){
    assert.ok(!used.has(a.attackerId));
    assert.ok(!used.has(a.defenderId));
    used.add(a.attackerId);
    used.add(a.defenderId);
    const attacker=plan.pairs.find(p=>p.id===a.attackerId);
    const defender=plan.pairs.find(p=>p.id===a.defenderId);
    assert.ok(attacker.position>defender.position);
  }
});


test('reaching #1 starts promotion at 0 and the match that got there does not count',()=>{
  assert.deepEqual(
    promotionStateAfterResult({
      category:3,
      position:1,
      activeCount:8,
      currentWins:0,
      isRealMatch:true,
      won:true,
      threshold:3,
      wasNumberOneBefore:false,
    }),
    {active:true,wins:0,promote:false,awaitingFirstMatch:false},
  );
});

test('touching last starts relegation at 0 even when the same loss caused the move',()=>{
  assert.deepEqual(
    relegationStateAfterResult({
      category:4,
      wasInRelegation:false,
      losses:0,
      routeStep:0,
      isRealMatch:true,
      won:false,
      isLast:true,
      threshold:3,
    }),
    {active:true,losses:0,routeStep:0,descend:false,awaitingFirstMatch:false},
  );
});


test('a resolved no-show can count as a First-place defense without being a real match',()=>{
  assert.deepEqual(
    firstPlaceReignAfterResult({
      category:1,
      wasNumberOne:true,
      remainsNumberOne:true,
      isRealMatch:false,
      countsAsDefense:true,
      currentDefenses:4,
    }),
    {open:true,defenses:5,ended:false,defended:true},
  );
});


test('planning preserves an existing middle role when no real match changed it',()=>{
  const rows=normalizeRolesForPlanning([
    {id:1,position:1,role:'defense',roleStreak:1,defenseRequiredUntilReal:false,active:true,free:true,realWaitingSince:'2026-09-01T00:00:00Z'},
    {id:2,position:2,role:'attack',roleStreak:1,defenseRequiredUntilReal:false,active:true,free:true,realWaitingSince:'2026-09-02T00:00:00Z'},
    {id:3,position:3,role:'attack',roleStreak:1,defenseRequiredUntilReal:false,active:true,free:true,realWaitingSince:'2026-09-03T00:00:00Z'},
    {id:4,position:4,role:'attack',roleStreak:1,defenseRequiredUntilReal:false,active:true,free:true,realWaitingSince:'2026-09-04T00:00:00Z'},
  ]);
  assert.equal(rows.find(x=>x.id===2).role,'attack');
  assert.equal(rows.find(x=>x.id===3).role,'attack');
});


test('relegation attacker follows low-to-high difficulty route instead of normal wait priority',()=>{
  const attacker={
    id:8,position:8,role:'attack',active:true,free:true,
    realWaitingSince:'2026-09-01T00:00:00Z',
    relegationActive:true,relegationRouteStep:1,
  };
  const defender=chooseDefenderForAttacker(attacker,[
    {id:7,position:7,role:'defense',active:true,free:true,realWaitingSince:'2026-09-20T00:00:00Z'},
    {id:6,position:6,role:'defense',active:true,free:true,realWaitingSince:'2026-09-27T00:00:00Z'},
    {id:5,position:5,role:'defense',active:true,free:true,realWaitingSince:'2026-08-01T00:00:00Z'},
  ]);
  assert.equal(defender.id,6);
});

test('relegation route avoids immediate repeat when another reasonable target exists',()=>{
  const attacker={
    id:8,position:8,role:'attack',active:true,free:true,
    realWaitingSince:'2026-09-01T00:00:00Z',
    relegationActive:true,relegationRouteStep:0,
  };
  const defender=chooseDefenderForAttacker(attacker,[
    {id:7,position:7,role:'defense',active:true,free:true,realWaitingSince:'2026-09-20T00:00:00Z'},
    {id:6,position:6,role:'defense',active:true,free:true,realWaitingSince:'2026-09-21T00:00:00Z'},
  ],{lastOpponentId:7});
  assert.equal(defender.id,6);
});


test('structural extremes are based on the full active ladder, not only free pairs',()=>{
  const rows=normalizeRolesForPlanning([
    {id:1,position:1,role:'defense',roleStreak:1,active:true,free:false,realWaitingSince:'2026-09-01T00:00:00Z'},
    {id:2,position:2,role:'attack',roleStreak:1,active:true,free:true,realWaitingSince:'2026-09-02T00:00:00Z'},
    {id:3,position:3,role:'defense',roleStreak:1,active:true,free:true,realWaitingSince:'2026-09-03T00:00:00Z'},
    {id:4,position:4,role:'attack',roleStreak:1,active:true,free:false,realWaitingSince:'2026-09-04T00:00:00Z'},
  ]);
  assert.equal(rows.find(x=>x.id===2).role,'attack');
  assert.equal(rows.find(x=>x.id===3).role,'defense');
  assert.equal(rows.find(x=>x.id===1).role,'defense');
  assert.equal(rows.find(x=>x.id===4).role,'attack');
});

test('occupied real leader does not turn free #2 into a fake structural defender',()=>{
  const plan=planCategoryWheel([
    {id:1,position:1,role:'defense',roleStreak:1,active:true,free:false,realWaitingSince:'2026-09-01T00:00:00Z'},
    {id:2,position:2,role:'attack',roleStreak:1,active:true,free:true,realWaitingSince:'2026-09-02T00:00:00Z'},
    {id:3,position:3,role:'defense',roleStreak:1,active:true,free:true,realWaitingSince:'2026-09-03T00:00:00Z'},
    {id:4,position:4,role:'attack',roleStreak:1,active:true,free:true,realWaitingSince:'2026-09-04T00:00:00Z'},
  ]);
  assert.equal(plan.pairs.find(x=>x.id===2).role,'attack');
});


test('compulsory defense persists after an attack and clears only after a real defense unless structurally impossible',()=>{
  assert.deepEqual(
    roleAfterRealMatch({
      previousRole:'attack',
      wasAttacker:true,
      roleStreak:1,
      position:4,
      activeCount:8,
      defenseRequiredUntilReal:true,
    }),
    {role:'defense',roleStreak:1,defenseRequiredUntilReal:true},
  );

  assert.deepEqual(
    roleAfterRealMatch({
      previousRole:'defense',
      wasAttacker:false,
      roleStreak:1,
      position:4,
      activeCount:8,
      defenseRequiredUntilReal:true,
    }),
    {role:'attack',roleStreak:1,defenseRequiredUntilReal:false},
  );

  assert.deepEqual(
    roleAfterRealMatch({
      previousRole:'attack',
      wasAttacker:true,
      roleStreak:1,
      position:8,
      activeCount:8,
      defenseRequiredUntilReal:true,
    }),
    {role:'attack',roleStreak:2,defenseRequiredUntilReal:false},
  );
});


test('immediate repeat expands to the next window when a fresh superior defender exists',()=>{
  const attacker={id:8,position:8,role:'attack',active:true,free:true,realWaitingSince:'2026-09-01T00:00:00Z'};
  const defender=chooseDefenderForAttacker(attacker,[
    {id:7,position:7,role:'defense',active:true,free:true,realWaitingSince:'2026-08-01T00:00:00Z'},
    {id:4,position:4,role:'defense',active:true,free:true,realWaitingSince:'2026-09-20T00:00:00Z'},
  ],{lastOpponentId:7});
  assert.equal(defender.id,4);
});

test('population acceleration may use an equal combined deviation but never a worse one',()=>{
  const equal=[20,18,10,10,10,10,10];
  assert.equal(populationMoveImprovesBalance(equal,0,1),true);
  assert.equal(populationDirectionalThreshold(equal,0,1),1);

  const worse=[12,20,10,10,10,10,12];
  assert.equal(populationMoveImprovesBalance(worse,0,1),false);
  assert.equal(populationDirectionalThreshold(worse,0,1),3);
});
