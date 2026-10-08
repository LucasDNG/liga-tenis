import test from 'node:test';
import assert from 'node:assert/strict';
import {swapLadder,chooseOpponent} from '../src/core.js';

function rng(seed=1234567){let x=seed>>>0;return()=>{x=(1664525*x+1013904223)>>>0;return x/2**32;};}

test('5-year style simulation with 101 pairs keeps ladder valid and explores rivals',()=>{
  const random=rng();
  let rows=Array.from({length:101},(_,i)=>({id:i+1,position:i+1}));
  const last={}; const meetings=new Set(); let clock=Date.UTC(2026,0,1);
  for(let day=0;day<1825;day++){
    const p=rows[day%rows.length];
    const candidates=rows.filter(c=>c.id!==p.id);
    const opp=chooseOpponent(p,candidates,last);
    const winner=random()<.5?p:opp, loser=winner.id===p.id?opp:p;
    rows=swapLadder(rows,winner.id,loser.id);
    clock+=24*60*60*1000;
    const key=`${Math.min(p.id,opp.id)}:${Math.max(p.id,opp.id)}`;
    last[key]=new Date(clock).toISOString(); meetings.add(key);
    const positions=rows.map(r=>r.position).sort((a,b)=>a-b);
    assert.deepEqual(positions,Array.from({length:101},(_,i)=>i+1));
    assert.equal(new Set(rows.map(r=>r.id)).size,101);
  }
  assert.ok(meetings.size>1000,'five years should explore many distinct crossings');
});

test('10k sporting swaps never duplicate a position',()=>{
  const random=rng(99);let rows=Array.from({length:101},(_,i)=>({id:i+1,position:i+1}));
  for(let i=0;i<10000;i++){
    const a=1+Math.floor(random()*101);let b=1+Math.floor(random()*101);if(a===b)b=(b%101)+1;
    rows=swapLadder(rows,a,b);
  }
  assert.equal(new Set(rows.map(r=>r.position)).size,101);
  assert.deepEqual(rows.map(r=>r.position).sort((a,b)=>a-b),Array.from({length:101},(_,i)=>i+1));
});
