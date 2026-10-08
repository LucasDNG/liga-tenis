import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createGracefulShutdown,installRuntimeHandlers,bindPoolErrorHandler} from '../src/runtimeLifecycle.js';

test('graceful shutdown closes server and pool once and exits with requested code',async()=>{
  let closes=0,poolEnds=0;
  const exits=[];
  const server={
    close(cb){closes+=1;cb();},
    closeAllConnections(){throw new Error('no debería hacer falta');},
  };
  const shutdown=createGracefulShutdown({
    server,
    pool:{end:async()=>{poolEnds+=1;}},
    timers:[],
    exit:code=>exits.push(code),
    production:true,
  });
  await Promise.all([
    shutdown('SIGTERM',{exitCode:0}),
    shutdown('SIGINT',{exitCode:1}),
  ]);
  assert.equal(closes,1);
  assert.equal(poolEnds,1);
  assert.deepEqual(exits,[0]);
});

test('fatal shutdown sanitizes error details before exiting non-zero',async()=>{
  const logs=[];
  const shutdown=createGracefulShutdown({
    server:{close:cb=>cb()},
    pool:{end:async()=>{}},
    exit:()=>{},
    logError:entry=>logs.push(entry),
    production:true,
  });
  await shutdown('uncaughtException',{
    error:Object.assign(new Error('DNI 12345678 password failed'),{detail:'SQL secret'}),
    exitCode:1,
  });
  assert.equal(logs.length,1);
  assert.equal(logs[0].task,'process:uncaughtException');
  const serialized=JSON.stringify(logs);
  assert.equal(serialized.includes('12345678'),false);
  assert.equal(serialized.includes('SQL secret'),false);
});

test('pool shutdown failure is sanitized and forces exit code 1',async()=>{
  const logs=[],exits=[];
  const shutdown=createGracefulShutdown({
    server:{close:cb=>cb()},
    pool:{end:async()=>{throw new Error('postgres password secret');}},
    exit:code=>exits.push(code),
    logError:entry=>logs.push(entry),
    production:true,
  });
  await shutdown('SIGTERM',{exitCode:0});
  assert.deepEqual(exits,[1]);
  assert.equal(logs[0].task,'shutdown:pool');
  assert.equal('message' in logs[0],false);
});

test('runtime handlers map signals and fatal process events to shutdown',()=>{
  const processRef=new EventEmitter();
  const seen=[];
  const cleanup=installRuntimeHandlers({
    processRef,
    shutdown:(reason,options)=>seen.push({reason,options}),
  });
  processRef.emit('SIGTERM');
  processRef.emit('unhandledRejection',new Error('boom'));
  assert.equal(seen[0].reason,'SIGTERM');
  assert.deepEqual(seen[0].options,{exitCode:0});
  assert.equal(seen[1].reason,'unhandledRejection');
  assert.equal(seen[1].options.exitCode,1);
  cleanup();
  assert.equal(processRef.listenerCount('SIGINT'),0);
  assert.equal(processRef.listenerCount('uncaughtException'),0);
});


test('idle PostgreSQL pool errors trigger sanitized fatal shutdown path',()=>{
  const pool=new EventEmitter();
  const seen=[];
  const cleanup=bindPoolErrorHandler({
    pool,
    shutdown:(reason,options)=>seen.push({reason,options}),
  });
  const error=new Error('connection terminated with secret');
  pool.emit('error',error);
  assert.equal(seen.length,1);
  assert.equal(seen[0].reason,'postgres-pool');
  assert.equal(seen[0].options.error,error);
  assert.equal(seen[0].options.exitCode,1);
  cleanup();
  assert.equal(pool.listenerCount('error'),0);
});
