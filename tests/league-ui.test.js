import test from 'node:test';
import assert from 'node:assert/strict';
import {argentinaInputToIso,toArgentinaInput,assignmentPairName,resultScoreText,canEditResult} from '../frontend/src/leagueUi.js';

test('schedule and actual played time carry Argentina offset across timezone/day boundaries',()=>{
  assert.equal(argentinaInputToIso('2026-09-29T21:30'),'2026-09-30T00:30:00.000Z');
  assert.equal(argentinaInputToIso('2026-09-29T09:15'),'2026-09-29T12:15:00.000Z');
  assert.equal(toArgentinaInput('2026-09-30T00:30:17.000Z'),'2026-09-29T21:30:17');
  assert.equal(argentinaInputToIso(toArgentinaInput('2026-09-30T00:30:17Z')),'2026-09-30T00:30:17.000Z');
  assert.equal(argentinaInputToIso(''),'');
  assert.equal(argentinaInputToIso('2026-09-29'),'');
});

test('receiving a rival result keeps submission available for a conflicting version',()=>{
  assert.equal(canEditResult({status:'result_pending',otherVersion:{id:10},myVersion:null}),true);
  assert.equal(canEditResult({status:'result_pending',myVersion:{id:11}}),true);
  assert.equal(canEditResult({status:'disputed',otherVersion:{id:10},myVersion:{id:11}}),false);
  assert.equal(canEditResult({status:'confirmed'}),false);
});

test('review labels preserve canonical A/B score orientation for either participant',()=>{
  const pair={id:'22',players:'Mi pareja'};
  const assignment={pair_a_id:11,pair_b_id:22,rival:{id:11,players:'Rival'}};
  assert.equal(assignmentPairName(assignment.pair_a_id,pair,assignment),'Rival');
  assert.equal(assignmentPairName(assignment.pair_b_id,pair,assignment),'Mi pareja');
  assert.equal(resultScoreText({result_type:'normal',score:{sets:[{pairA:4,pairB:6},{pairA:6,pairB:3},{pairA:8,pairB:10,kind:'match_tiebreak'}]}}),'4–6 · 6–3 · 8–10 (super tie-break)');
  assert.equal(resultScoreText({result_type:'injury_abandonment',score:null}),'Lesión / abandono');
});
