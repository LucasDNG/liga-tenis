import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeScore,scoreGames,resultEquals,swapLadder,chooseOpponent,individualCategoryAfterMove,validResponsibilityProposal,relegationLossThreshold} from '../src/core.js';

test('ladder swaps only when winner is below loser',()=>{const rows=[1,2,3,4,5,6,7].map(n=>({id:n,position:n}));const out=swapLadder(rows,7,4);assert.equal(out.find(x=>x.id===7).position,4);assert.equal(out.find(x=>x.id===4).position,7);assert.equal(out.find(x=>x.id===5).position,5);});
test('higher ranked winner keeps positions',()=>{const rows=[1,2,3].map(n=>({id:n,position:n}));const out=swapLadder(rows,1,3);assert.deepEqual(out.map(x=>x.position),[1,2,3]);});
test('structured score rejects impossible third set after 2-0',()=>assert.throws(()=>normalizeScore({sets:[{pairA:6,pairB:2},{pairA:6,pairB:3},{pairA:4,pairB:6}]}),/tercer parcial/i));
test('match tiebreak only as third partial',()=>assert.throws(()=>normalizeScore({sets:[{pairA:6,pairB:4},{pairA:10,pairB:8,kind:'match_tiebreak'}]}),/tercer set/i));
test('games ignore super tiebreak',()=>{const s=normalizeScore({sets:[{pairA:6,pairB:4},{pairA:3,pairB:6},{pairA:10,pairB:8,kind:'match_tiebreak'}]});assert.deepEqual(scoreGames(s),{a:9,b:10,diff:-1});});
test('result equality normalizes date in Buenos Aires',()=>{const a={winner_pair_id:1,result_type:'normal',played_at:'2026-09-20T23:30:00-03:00',score:{sets:[{pairA:6,pairB:4},{pairA:6,pairB:4}]}},b={...a,played_at:'2026-09-21T02:30:00Z'};assert.equal(resultEquals(a,b),true);});
test('never played rival beats previously played',()=>{const pair={id:1};const c=[{id:2},{id:3}];const x=chooseOpponent(pair,c,{'1:2':'2026-01-01'});assert.equal(x.id,3);});
test('individual category is not lifted merely by stronger partner',()=>{assert.equal(individualCategoryAfterMove(5,2,3),5);assert.equal(individualCategoryAfterMove(2,2,3),3);assert.equal(individualCategoryAfterMove(5,2,1),1);assert.equal(individualCategoryAfterMove(5,5,6),6);});
test('last minute proposal does not establish unilateral compliance',()=>{const d=new Date('2026-09-30T00:00:00Z');assert.equal(validResponsibilityProposal(new Date(d-6*3600000),d),false);assert.equal(validResponsibilityProposal(new Date(d-48*3600000),d),true);});

import {eloForPosition,simultaneousPenaltyOrder} from '../src/core.js';
test('positional ELO spans 2000 to 0 and only First #1 can exceed 2000',()=>{assert.equal(eloForPosition({activeCount:5,activePosition:1,played:2,categoryNumber:3}),2000);assert.equal(eloForPosition({activeCount:5,activePosition:5,played:2,categoryNumber:3}),0);assert.equal(eloForPosition({activeCount:5,activePosition:1,played:2,categoryNumber:1,defenses:7}),2007);assert.equal(eloForPosition({activeCount:5,activePosition:2,played:0,categoryNumber:1}),0);});
test('simultaneous contiguous penalties move the block once',()=>{const r=simultaneousPenaltyOrder([1,2,3,4],[2,3],{});assert.deepEqual(r.order,[1,4,2,3]);assert.equal(r.debt[2]||0,0);});
test('penalized block at bottom accumulates debt',()=>{const r=simultaneousPenaltyOrder([1,2,3,4],[3,4],{});assert.deepEqual(r.order,[1,2,3,4]);assert.equal(r.debt[3],1);assert.equal(r.debt[4],1);});

test('relegation uses a pressure valve only when the category is five pairs heavier than the one below',()=>{
  assert.equal(relegationLossThreshold({categoryNumber:3,currentActiveCount:12,lowerActiveCount:12}),3);
  assert.equal(relegationLossThreshold({categoryNumber:3,currentActiveCount:16,lowerActiveCount:12}),3);
  assert.equal(relegationLossThreshold({categoryNumber:3,currentActiveCount:17,lowerActiveCount:12}),2);
  assert.equal(relegationLossThreshold({categoryNumber:3,currentActiveCount:40,lowerActiveCount:35}),2);
  assert.equal(relegationLossThreshold({categoryNumber:7,currentActiveCount:30,lowerActiveCount:0}),Infinity);
});
