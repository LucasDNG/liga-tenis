import test from 'node:test';
import assert from 'node:assert/strict';
import {readLiveness,readHealth} from '../src/health.js';

test('liveness is dependency-free and leaves authoritative engine to readiness',()=>{
  const live=readLiveness();
  assert.equal(live.ok,true);
  assert.equal(live.name,'LA RED Tenis');
  assert.equal(live.engine,'database-selected');
  assert.equal(live.timezone,'America/Argentina/Buenos_Aires');
  assert.equal(live.process,'ok');
  assert.ok(live.release===null||typeof live.release==='string');
});

test('readiness remains database-aware and verifies engine',async()=>{
  const queries=[];
  const client={
    async query(sql){
      queries.push(sql);
      if(sql.includes("app_settings"))return {rows:[{value:'wheel-v2'}]};
      return {rows:[{}]};
    }
  };
  const result=await readHealth(client);
  assert.equal(result.database,'ok');
  assert.equal(result.engine,'wheel-v2');
  assert.equal(queries.length,2);
});

test('readiness rejects an unexpected engine',async()=>{
  const client={query:async()=>({rows:[{value:'wheel-v1'}]})};
  await assert.rejects(()=>readHealth(client),/Motor competitivo inesperado/);
});


test('readiness accepts wheel-v3 as an explicitly supported engine',async()=>{
  const client={
    async query(sql){
      if(sql.includes('app_settings'))return {rows:[{value:'wheel-v3'}]};
      return {rows:[{}]};
    }
  };
  const result=await readHealth(client);
  assert.equal(result.database,'ok');
  assert.equal(result.engine,'wheel-v3');
});


test('health exposes deployment commit from Render metadata when available',async()=>{
  const previous=process.env.RENDER_GIT_COMMIT;
  process.env.RENDER_GIT_COMMIT='abc123';
  try{
    const client={
      async query(sql){
        if(sql.includes('app_settings'))return {rows:[{value:'wheel-v3'}]};
        return {rows:[{}]};
      }
    };
    const result=await readHealth(client);
    assert.equal(result.release,'abc123');
    assert.equal(readLiveness().release,'abc123');
  }finally{
    if(previous===undefined)delete process.env.RENDER_GIT_COMMIT;
    else process.env.RENDER_GIT_COMMIT=previous;
  }
});
