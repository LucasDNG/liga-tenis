import test from 'node:test';
import assert from 'node:assert/strict';
import {BALANCE_RULES,expectedConsecutiveRunWait,runBalanceMatrix,aggregateAcrossSkillGaps} from '../scripts/simulate-category-balance.js';

const HORIZONS=[5,10,20];
const selected=BALANCE_RULES.filter(r=>['fixed-3','fixed-5','adaptive-gap-4','adaptive-gap-5','adaptive-gap-6'].includes(r.key));
const matrix=runBalanceMatrix({rules:selected,runs:36,horizons:HORIZONS});
const summary=aggregateAcrossSkillGaps(matrix,{rules:selected,horizons:HORIZONS});
const get=(key,years=20)=>summary.find(r=>r.rule===key&&r.years===years);

test('five consecutive losses are mathematically much rarer than three',()=>{
  assert.equal(expectedConsecutiveRunWait(.5,3),14);
  assert.equal(expectedConsecutiveRunWait(.5,5),62);
  assert.ok(expectedConsecutiveRunWait(.6,5)>expectedConsecutiveRunWait(.6,3)*3);
});

test('balance simulations conserve all 84 pairs at 5, 10 and 20 years',()=>{
  for(const row of summary)assert.ok(Math.abs(row.counts.reduce((sum,n)=>sum+n,0)-84)<1e-9);
});

test('five-loss relegation worsens upward population drift',()=>{
  assert.ok(get('fixed-5').counts[0]>60);
  assert.ok(get('fixed-5').stabilityRmse>get('fixed-3').stabilityRmse*2.5);
  assert.ok(get('fixed-5').emptyRunRate>0.30);
});

test('current gap-5 pressure valve balances long-run flows',()=>{
  const current=get('adaptive-gap-5');
  assert.ok(Math.abs(current.promotions-current.relegations)<15);
  assert.ok(current.stabilityRmse<4.5);
  assert.ok(current.emptyRunRate<0.05);
});

test('gap 5 is the strongest 20-year compromise among tested adaptive gaps',()=>{
  const g4=get('adaptive-gap-4'),g5=get('adaptive-gap-5'),g6=get('adaptive-gap-6');
  assert.ok(g5.stabilityRmse<g4.stabilityRmse&&g5.stabilityRmse<g6.stabilityRmse);
  assert.ok(Math.abs(g5.topMinusBottom)<Math.abs(g4.topMinusBottom));
  assert.ok(Math.abs(g5.topMinusBottom)<Math.abs(g6.topMinusBottom));
});
