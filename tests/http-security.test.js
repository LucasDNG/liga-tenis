import test from 'node:test';
import assert from 'node:assert/strict';
import {safeErrorLog,authRateLimitKey,safeClientErrorMessage,safeBackgroundErrorLog,createFixedWindowRateLimitStore,createRequestTrace} from '../src/httpSecurity.js';

test('production error logs never expose PostgreSQL detail or user message',()=>{
  const err={
    name:'error',
    code:'23505',
    message:'duplicate key value violates unique constraint users_dni_key',
    detail:'Key (dni)=(12345678) already exists.',
    query:'INSERT INTO users ...'
  };
  const entry=safeErrorLog(err,{method:'POST',path:'/api/auth/register'},{production:true});
  const serialized=JSON.stringify(entry);
  assert.equal(entry.code,'23505');
  assert.equal(entry.status,400);
  assert.equal(entry.path,'/api/auth/register');
  assert.equal(serialized.includes('12345678'),false);
  assert.equal(serialized.includes('duplicate key'),false);
  assert.equal(serialized.includes('INSERT INTO'),false);
  assert.equal('message' in entry,false);
});

test('development error logs keep only bounded message, never database detail',()=>{
  const err={name:'Error',message:'falló algo',detail:'DNI 12345678',code:'XX000'};
  const entry=safeErrorLog(err,{method:'GET',originalUrl:'/api/test?q=secret'},{production:false});
  assert.equal(entry.message,'falló algo');
  assert.equal(entry.path,'/api/test');
  assert.equal(JSON.stringify(entry).includes('12345678'),false);
  assert.equal('code' in entry,false);
});

test('auth rate limit keys isolate authentication endpoints for the same IP',()=>{
  const login=authRateLimitKey({ip:'203.0.113.5',path:'/api/auth/login'});
  const recovery=authRateLimitKey({ip:'203.0.113.5',path:'/api/auth/recovery/request'});
  const sameLogin=authRateLimitKey({ip:'203.0.113.5',path:'/api/auth/login'});
  assert.notEqual(login,recovery);
  assert.equal(login,sameLogin);
});


test('production client errors hide unexpected internal failures but preserve safe domain messages',()=>{
  assert.equal(
    safeClientErrorMessage({message:'password authentication failed for user postgres'},{production:true}),
    'Error interno'
  );
  assert.equal(
    safeClientErrorMessage({statusCode:409,message:'Invitación vencida o inexistente'},{production:true}),
    'Invitación vencida o inexistente'
  );
  assert.equal(
    safeClientErrorMessage({code:'23505',constraint:'users_dni_key',message:'raw db message'},{production:true}),
    'Ya existe una cuenta con ese DNI. Usá la recuperación de acceso.'
  );
});


test('production background error logs never expose provider or database payloads',()=>{
  const err={
    name:'DatabaseError',
    code:'23505',
    message:'duplicate DNI 12345678',
    detail:'Key (dni)=(12345678) already exists',
    responseBody:'recipient +5493329...',
  };
  const entry=safeBackgroundErrorLog(err,'maintenance',{production:true});
  const serialized=JSON.stringify(entry);
  assert.equal(entry.task,'maintenance');
  assert.equal(entry.code,'23505');
  assert.equal('message' in entry,false);
  assert.equal(serialized.includes('12345678'),false);
  assert.equal(serialized.includes('+549'),false);
});

test('fixed-window rate limit store is bounded and fails closed when saturated',()=>{
  const store=createFixedWindowRateLimitStore({windowMs:100,maxEntries:2});
  assert.equal(store.hit('a',0).count,1);
  assert.equal(store.hit('b',1).count,1);
  const blocked=store.hit('c',2);
  assert.equal(blocked.saturated,true);
  assert.equal(store.size(),2);
  assert.equal(store.hit('a',3).count,2);
  assert.equal(store.cleanup(101),0);
  const afterExpiry=store.hit('c',102);
  assert.equal(afterExpiry.saturated,false);
  assert.equal(afterExpiry.count,1);
  assert.equal(store.size(),1);
});


test('request trace uses server-generated id and only accepts safe CF-Ray metadata',()=>{
  const trace=createRequestTrace(
    {headers:{'x-request-id':'spoofed-user-id','cf-ray':'abc123-EZE'}},
    {generate:()=> '11111111-2222-4333-8444-555555555555'}
  );
  assert.equal(trace.requestId,'11111111-2222-4333-8444-555555555555');
  assert.equal(trace.cfRay,'abc123-EZE');
  assert.notEqual(trace.requestId,'spoofed-user-id');

  const unsafe=createRequestTrace(
    {headers:{'cf-ray':'bad value with spaces / secret'}},
    {generate:()=> 'trace-safe'}
  );
  assert.equal(unsafe.cfRay,undefined);
});

test('error log carries safe request correlation metadata without trusting payload fields',()=>{
  const entry=safeErrorLog(
    {message:'secret detail',detail:'DNI 12345678'},
    {method:'GET',path:'/api/test',requestId:'req-123',cfRay:'ray-456-EZE'},
    {production:true}
  );
  assert.equal(entry.requestId,'req-123');
  assert.equal(entry.cfRay,'ray-456-EZE');
  assert.equal(JSON.stringify(entry).includes('12345678'),false);
});
