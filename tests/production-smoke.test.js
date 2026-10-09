import test from 'node:test';
import assert from 'node:assert/strict';
import {runProductionSmoke} from '../src/productionSmoke.js';

const secureHeaders={
  'x-content-type-options':'nosniff',
  'x-frame-options':'DENY',
  'referrer-policy':'strict-origin-when-cross-origin',
  'content-security-policy':"frame-ancestors 'none'",
  'strict-transport-security':'max-age=31536000',
  'x-request-id':'11111111-2222-4333-8444-555555555555',
};

function response(body,{status=200,headers={}}={}){
  return new Response(typeof body==='string'?body:JSON.stringify(body),{
    status,
    headers:{'content-type':typeof body==='string'?'text/html':'application/json',...secureHeaders,...headers}
  });
}

test('production smoke validates DB-aware health, CORS and public endpoints',async()=>{
  const seen=[];
  const fetchImpl=async(url,options={})=>{
    seen.push({url,options});
    if(url==='https://api.example.com/api/live')return response({ok:true,engine:'wheel-v2',process:'ok'});
    if(url==='https://api.example.com/api/health')return response(
      {ok:true,engine:'wheel-v2',database:'ok'},
      {headers:{'access-control-allow-origin':'https://app.example.com'}}
    );
    if(url==='https://app.example.com')return response('<html><body><div id="root"></div></body></html>');
    if(url.endsWith('/api/auth/__smoke_no_store__'))return response('not found',{status:404,headers:{'cache-control':'no-store','pragma':'no-cache'}});
    if(url.endsWith('/api/legal/versions'))return response({terms:'v1'});
    return response([]);
  };
  const result=await runProductionSmoke({
    apiUrl:'https://api.example.com/',
    frontendUrl:'https://app.example.com/',
    fetchImpl
  });
  assert.equal(result.ok,true);
  assert.equal(result.cors,true);
  assert.equal(result.publicEndpoints,6);
  assert.equal(result.securityHeaders,true);
  assert.equal(result.privateNoStore,true);
  assert.equal(result.process,'ok');
  assert.equal(seen.length,10);
});

test('production smoke rejects wrong CORS even when health is otherwise green',async()=>{
  const fetchImpl=async(url)=>{
    if(url.endsWith('/api/live'))return response({ok:true,engine:'wheel-v2',process:'ok'});
    if(url.endsWith('/api/health'))return response(
      {ok:true,engine:'wheel-v2',database:'ok'},
      {headers:{'access-control-allow-origin':'https://wrong.example.com'}}
    );
    return response([]);
  };
  await assert.rejects(
    ()=>runProductionSmoke({
      apiUrl:'https://api.example.com',
      frontendUrl:'https://app.example.com',
      fetchImpl
    }),
    /CORS productivo/
  );
});


test('production smoke rejects non-origin production URLs before making requests',async()=>{
  const never=async()=>{throw new Error('fetch no debería ejecutarse');};
  await assert.rejects(
    ()=>runProductionSmoke({
      apiUrl:'https://api.example.com/api',
      frontendUrl:'https://app.example.com',
      fetchImpl:never
    }),
    /sin path/
  );
  await assert.rejects(
    ()=>runProductionSmoke({
      apiUrl:'https://api.example.com',
      frontendUrl:'https://app.example.com/?preview=1',
      fetchImpl:never
    }),
    /sin credenciales\/query\/fragmento/
  );
  await assert.rejects(
    ()=>runProductionSmoke({
      apiUrl:'https://user:pass@api.example.com',
      frontendUrl:'https://app.example.com',
      fetchImpl:never
    }),
    /sin credenciales\/query\/fragmento/
  );
});


test('production smoke rejects missing security headers',async()=>{
  const fetchImpl=async(url)=>{
    if(url.endsWith('/api/live'))return response({ok:true,engine:'wheel-v2',process:'ok'});
    if(url.endsWith('/api/health'))return response(
      {ok:true,engine:'wheel-v2',database:'ok'},
      {headers:{
        'access-control-allow-origin':'https://app.example.com',
        'x-content-type-options':'',
      }}
    );
    return response([]);
  };
  await assert.rejects(
    ()=>runProductionSmoke({
      apiUrl:'https://api.example.com',
      frontendUrl:'https://app.example.com',
      fetchImpl
    }),
    /x-content-type-options/
  );
});

test('production smoke rejects auth responses without no-store',async()=>{
  const fetchImpl=async(url)=>{
    if(url.endsWith('/api/live'))return response({ok:true,engine:'wheel-v2',process:'ok'});
    if(url.endsWith('/api/health'))return response(
      {ok:true,engine:'wheel-v2',database:'ok'},
      {headers:{'access-control-allow-origin':'https://app.example.com'}}
    );
    if(url.endsWith('/api/auth/__smoke_no_store__'))return response('not found',{status:404});
    if(url==='https://app.example.com')return response('<div id="root"></div>');
    if(url.endsWith('/api/legal/versions'))return response({});
    return response([]);
  };
  await assert.rejects(
    ()=>runProductionSmoke({
      apiUrl:'https://api.example.com',
      frontendUrl:'https://app.example.com',
      fetchImpl
    }),
    /Cache-Control: no-store/
  );
});


test('production smoke rejects invalid liveness before readiness checks',async()=>{
  const fetchImpl=async(url)=>{
    if(url.endsWith('/api/live'))return response({ok:false,engine:'wheel-v2',process:'starting'});
    throw new Error('no debería continuar');
  };
  await assert.rejects(
    ()=>runProductionSmoke({
      apiUrl:'https://api.example.com',
      frontendUrl:'https://app.example.com',
      fetchImpl
    }),
    /Liveness productiva inválida/
  );
});


test('production smoke rejects missing request correlation header',async()=>{
  const fetchImpl=async(url)=>{
    if(url.endsWith('/api/live'))return response(
      {ok:true,engine:'wheel-v2',process:'ok'},
      {headers:{'x-request-id':''}}
    );
    throw new Error('no debería continuar');
  };
  await assert.rejects(
    ()=>runProductionSmoke({
      apiUrl:'https://api.example.com',
      frontendUrl:'https://app.example.com',
      fetchImpl
    }),
    /X-Request-ID/
  );
});


test('production smoke can require Wheel v3 explicitly after cutover',async()=>{
  const fetchImpl=async(url)=>{
    if(url.endsWith('/api/live'))return response({ok:true,engine:'database-selected',process:'ok'});
    if(url.endsWith('/api/health'))return response(
      {ok:true,engine:'wheel-v3',database:'ok'},
      {headers:{'access-control-allow-origin':'https://app.example.com'}}
    );
    if(url.endsWith('/api/auth/__smoke_no_store__'))return response('not found',{status:404,headers:{'cache-control':'no-store','pragma':'no-cache'}});
    if(url==='https://app.example.com')return response('<div id="root"></div>');
    if(url.endsWith('/api/legal/versions'))return response({});
    return response([]);
  };
  const result=await runProductionSmoke({
    apiUrl:'https://api.example.com',
    frontendUrl:'https://app.example.com',
    expectedEngine:'wheel-v3',
    fetchImpl,
  });
  assert.equal(result.engine,'wheel-v3');
});

test('production smoke rejects a deployment whose engine differs from the expected cutover engine',async()=>{
  const fetchImpl=async(url)=>{
    if(url.endsWith('/api/live'))return response({ok:true,engine:'database-selected',process:'ok'});
    if(url.endsWith('/api/health'))return response(
      {ok:true,engine:'wheel-v2',database:'ok'},
      {headers:{'access-control-allow-origin':'https://app.example.com'}}
    );
    throw new Error('no debería continuar después de health');
  };
  await assert.rejects(
    ()=>runProductionSmoke({
      apiUrl:'https://api.example.com',
      frontendUrl:'https://app.example.com',
      expectedEngine:'wheel-v3',
      fetchImpl,
    }),
    /Engine productivo inesperado/,
  );
});


test('production smoke verifies exact backend and frontend release commits',async()=>{
  const sha='0123456789abcdef';
  const fetchImpl=async(url)=>{
    if(url.endsWith('/api/live'))return response({ok:true,engine:'database-selected',process:'ok',release:sha});
    if(url.endsWith('/api/health'))return response(
      {ok:true,engine:'wheel-v2',database:'ok',release:sha},
      {headers:{'access-control-allow-origin':'https://app.example.com'}}
    );
    if(url.endsWith('/api/auth/__smoke_no_store__'))return response('not found',{status:404,headers:{'cache-control':'no-store','pragma':'no-cache'}});
    if(url==='https://app.example.com')return response(`<html><head><meta name="la-red-release" content="${sha}"/></head><body><div id="root"></div></body></html>`);
    if(url.endsWith('/api/legal/versions'))return response({});
    return response([]);
  };
  const result=await runProductionSmoke({
    apiUrl:'https://api.example.com',
    frontendUrl:'https://app.example.com',
    expectedEngine:'wheel-v2',
    expectedBackendSha:sha,
    expectedFrontendSha:sha,
    fetchImpl,
  });
  assert.equal(result.backendRelease,sha);
  assert.equal(result.frontendRelease,sha);
});

test('production smoke rejects stale frontend even when backend is current',async()=>{
  const current='current-sha';
  const stale='stale-sha';
  const fetchImpl=async(url)=>{
    if(url.endsWith('/api/live'))return response({ok:true,engine:'database-selected',process:'ok',release:current});
    if(url.endsWith('/api/health'))return response(
      {ok:true,engine:'wheel-v2',database:'ok',release:current},
      {headers:{'access-control-allow-origin':'https://app.example.com'}}
    );
    if(url.endsWith('/api/auth/__smoke_no_store__'))return response('not found',{status:404,headers:{'cache-control':'no-store','pragma':'no-cache'}});
    if(url==='https://app.example.com')return response(`<html><head><meta name="la-red-release" content="${stale}"/></head><body><div id="root"></div></body></html>`);
    if(url.endsWith('/api/legal/versions'))return response({});
    return response([]);
  };
  await assert.rejects(
    ()=>runProductionSmoke({
      apiUrl:'https://api.example.com',
      frontendUrl:'https://app.example.com',
      expectedEngine:'wheel-v2',
      expectedBackendSha:current,
      expectedFrontendSha:current,
      fetchImpl,
    }),
    /Frontend desplegado en commit inesperado/,
  );
});
