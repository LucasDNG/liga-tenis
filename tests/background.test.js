import test from 'node:test';
import assert from 'node:assert/strict';
import {runBackgroundTasks} from '../src/background.js';

test('background tasks are isolated so outbox still runs when maintenance fails',async()=>{
  const calls=[];
  const logs=[];
  const result=await runBackgroundTasks({
    maintenanceTask:async()=>{calls.push('maintenance');throw Object.assign(new Error('DNI 12345678'),{detail:'secret'});},
    outboxTask:async()=>{calls.push('outbox');},
    logError:entry=>logs.push(entry),
    production:true,
  });

  assert.deepEqual(calls,['maintenance','outbox']);
  assert.deepEqual(result,[
    {task:'maintenance',ok:false},
    {task:'whatsapp-outbox',ok:true},
  ]);
  assert.equal(logs.length,1);
  assert.equal(logs[0].task,'maintenance');
  assert.equal(JSON.stringify(logs).includes('12345678'),false);
});

test('background tasks isolate an outbox failure without throwing the scheduler tick',async()=>{
  const logs=[];
  const result=await runBackgroundTasks({
    maintenanceTask:async()=>{},
    outboxTask:async()=>{throw new Error('Meta raw response with phone');},
    logError:entry=>logs.push(entry),
    production:true,
  });

  assert.deepEqual(result,[
    {task:'maintenance',ok:true},
    {task:'whatsapp-outbox',ok:false},
  ]);
  assert.equal(logs.length,1);
  assert.equal('message' in logs[0],false);
});
