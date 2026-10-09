import test from 'node:test';
import assert from 'node:assert/strict';
import {app} from '../src/app.js';

test('HTTP middleware emits security headers and no-store on private namespaces',async()=>{
  const server=await new Promise(resolve=>{
    const s=app.listen(0,'127.0.0.1',()=>resolve(s));
  });
  try{
    const {port}=server.address();
    const publicResponse=await fetch(`http://127.0.0.1:${port}/api/legal/versions`);
    assert.equal(publicResponse.status,200);
    assert.equal(publicResponse.headers.get('x-content-type-options'),'nosniff');
    assert.equal(publicResponse.headers.get('x-frame-options'),'DENY');
    assert.match(publicResponse.headers.get('x-request-id')||'',/^[0-9a-f-]{36}$/i);
    assert.equal(publicResponse.headers.get('cache-control'),null);

    const privateResponse=await fetch(`http://127.0.0.1:${port}/api/auth/not-a-route`);
    assert.equal(privateResponse.status,404);
    assert.equal(privateResponse.headers.get('cache-control'),'no-store');
    assert.equal(privateResponse.headers.get('pragma'),'no-cache');
  }finally{
    await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
  }
});
