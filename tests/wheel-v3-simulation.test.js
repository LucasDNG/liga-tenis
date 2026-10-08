import test from 'node:test';
import assert from 'node:assert/strict';
import {
  entryPositionPenultimate,
  directionalThreshold,
  delayedResultMovement,
  simulateWheelV3,
} from '../scripts/simulate-wheel-v3.js';

test('penultimate entry keeps the only leader when N=1',()=>{
  assert.equal(entryPositionPenultimate(0),1);
  assert.equal(entryPositionPenultimate(1),2);
  assert.equal(entryPositionPenultimate(2),2);
  assert.equal(entryPositionPenultimate(10),10);
});

test('delayed result never pushes the winner below the loser',()=>{
  assert.deepEqual(
    delayedResultMovement({winnerPosition:8,loserPosition:4}),
    {winnerPosition:4,loserPosition:8,moved:true},
  );
  assert.deepEqual(
    delayedResultMovement({winnerPosition:3,loserPosition:7}),
    {winnerPosition:3,loserPosition:7,moved:false},
  );
});

test('population acceleration is directional and conservative',()=>{
  assert.equal(directionalThreshold([12,12,12,12,12,12,12],3,4),3);
  assert.equal(directionalThreshold([20,12,12,12,12,8,8],0,1),1);
  assert.equal(directionalThreshold([8,8,12,12,12,12,20],6,5),1);
});

test('Wheel v3 penultimate entry is longitudinally stable from balanced populations',()=>{
  for(const skillGap of [0,0.7,1]){
    const r=simulateWheelV3({
      runs:18,
      years:10,
      skillGap,
      seedBase:41000+Math.round(skillGap*100),
    });
    assert.equal(r.total,84);
    assert.equal(r.emptyRunRate,0);
    assert.equal(r.noMatchCycles,0);
    assert.ok(r.stabilityRmse<4.5);
    assert.ok(Math.abs(r.topMinusBottom)<5);
    assert.ok(Math.abs(r.promotions-r.relegations)<20);
  }
});

test('population pressure moves strongly uneven leagues toward balance',()=>{
  const cases=[[20,16,14,12,10,7,5],[5,7,10,12,14,16,20]];
  for(let i=0;i<cases.length;i++){
    const start=cases[i],target=start.reduce((s,n)=>s+n,0)/7;
    const startRmse=Math.sqrt(start.reduce((s,n)=>s+(n-target)**2,0)/7);
    const r=simulateWheelV3({
      runs:18,
      years:20,
      counts:start,
      skillGap:0.7,
      seedBase:52000+i*1000,
    });
    assert.equal(r.emptyRunRate,0);
    assert.ok(r.stabilityRmse<startRmse*0.75);
  }
});
