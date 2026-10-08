import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {runAuthenticatedProductionSmoke} from '../src/authenticatedProductionSmoke.js';

function response(data,{status=200}={}){
  return new Response(JSON.stringify(data),{
    status,
    headers:{'content-type':'application/json','cache-control':'no-store'}
  });
}

test('authenticated production smoke validates player and admin read-only surfaces',async()=>{
  const previous=process.env.JWT_SECRET;
  process.env.JWT_SECRET='test-secret-test-secret-test-secret';

  const admin={id:1,role:'admin'};
  const player={id:2,role:'player'};
  const pool={
    async query(sql){
      if(sql.includes("role='admin'"))return {rows:[admin]};
      if(sql.includes('JOIN pair_members'))return {rows:[player]};
      if(sql.includes("role<>'admin'"))return {rows:[player]};
      throw new Error('Unexpected SQL');
    }
  };

  const fetchImpl=async(url,options={})=>{
    const path=new URL(url).pathname+new URL(url).search;
    const auth=options.headers?.Authorization||'';
    if(!auth)return response({error:'No autenticado'},{status:401});
    const decoded=jwt.decode(auth.slice(7));
    if(path==='/api/admin/status'){
      if(Number(decoded.id)!==admin.id)return response({error:'Solo administrador'},{status:403});
      return response({engine:'wheel-v3',whatsapp:true,outboxPending:2,outboxFailed:1});
    }
    if(path==='/api/me')return response({id:Number(decoded.id)});
    if(path.startsWith('/api/admin/'))return response([]);
    if(path.startsWith('/api/me/'))return response(path==='/api/me/pair'?{pair:{id:10}}:[]);
    throw new Error('Unexpected URL '+path);
  };

  try{
    const result=await runAuthenticatedProductionSmoke({
      pool,
      apiUrl:'https://api.example.com',
      frontendUrl:'https://app.example.com',
      fetchImpl,
    });
    assert.deepEqual(result,{
      ok:true,
      engine:'wheel-v3',
      anonymousRejected:true,
      adminVerified:true,
      adminReadEndpoints:7,
      whatsappConfigured:true,
      whatsappOutboxPending:2,
      whatsappOutboxFailed:1,
      playerAvailable:true,
      playerReadEndpoints:4,
      pairedPlayerAvailable:true,
      leagueChecked:true,
    });
  }finally{
    if(previous===undefined)delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET=previous;
  }
});

test('authenticated smoke remains useful when production has no verified player yet',async()=>{
  const previous=process.env.JWT_SECRET;
  process.env.JWT_SECRET='test-secret-test-secret-test-secret';

  const admin={id:1,role:'admin'};
  const pool={
    async query(sql){
      if(sql.includes("role='admin'"))return {rows:[admin]};
      if(sql.includes('JOIN pair_members'))return {rows:[]};
      if(sql.includes("role<>'admin'"))return {rows:[]};
      throw new Error('Unexpected SQL');
    }
  };
  const fetchImpl=async(url,options={})=>{
    const path=new URL(url).pathname+new URL(url).search;
    const auth=options.headers?.Authorization||'';
    if(!auth)return response({error:'No autenticado'},{status:401});
    const decoded=jwt.decode(auth.slice(7));
    if(path==='/api/me')return response({id:Number(decoded.id)});
    if(path==='/api/admin/status')return response({engine:'wheel-v3'});
    if(path.startsWith('/api/admin/'))return response([]);
    throw new Error('Unexpected URL '+path);
  };

  try{
    const result=await runAuthenticatedProductionSmoke({
      pool,
      apiUrl:'https://api.example.com',
      frontendUrl:'https://app.example.com',
      fetchImpl,
    });
    assert.equal(result.ok,true);
    assert.equal(result.playerAvailable,false);
    assert.equal(result.leagueChecked,false);
  }finally{
    if(previous===undefined)delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET=previous;
  }
});
