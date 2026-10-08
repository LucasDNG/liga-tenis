import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareStartup,startupFailureEntry} from '../src/startup.js';

test('startup skips production migrations outside production',async()=>{
  let connected=false;
  const result=await prepareStartup({
    env:{NODE_ENV:'test'},
    assertConfig:()=>({warnings:['dev warning'],errors:[]}),
    pool:{connect:async()=>{connected=true;}},
    applyMigrations:async()=>{throw new Error('should not run');},
  });
  assert.equal(connected,false);
  assert.deepEqual(result.migrated,[]);
  assert.deepEqual(result.report.warnings,['dev warning']);
});

test('production startup applies migrations and always releases the client',async()=>{
  let released=0;
  const client={release:()=>{released+=1;}};
  const result=await prepareStartup({
    env:{NODE_ENV:'production'},
    assertConfig:()=>({warnings:[],errors:[]}),
    pool:{connect:async()=>client},
    applyMigrations:async(received)=>{
      assert.equal(received,client);
      return {applied:['patch-a']};
    },
  });
  assert.deepEqual(result.migrated,['patch-a']);
  assert.equal(released,1);
});

test('production startup releases client on migration failure and fatal log is sanitized',async()=>{
  let released=0;
  const raw=Object.assign(new Error('password authentication failed for DNI 12345678'),{
    detail:'postgres secret detail',
  });
  await assert.rejects(
    ()=>prepareStartup({
      env:{NODE_ENV:'production'},
      assertConfig:()=>({warnings:[],errors:[]}),
      pool:{connect:async()=>({release:()=>{released+=1;}})},
      applyMigrations:async()=>{throw raw;},
    }),
    /12345678/
  );
  assert.equal(released,1);
  const log=startupFailureEntry(raw,{production:true});
  assert.equal(log.task,'startup');
  assert.equal('message' in log,false);
  assert.equal(JSON.stringify(log).includes('12345678'),false);
  assert.equal(JSON.stringify(log).includes('postgres secret'),false);
});
