import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {securityResponseHeaders,privateResponseHeaders} from '../src/httpSecurity.js';

test('backend security headers are strict without breaking API CORS',()=>{
  const prod=securityResponseHeaders({production:true});
  assert.equal(prod['X-Content-Type-Options'],'nosniff');
  assert.equal(prod['X-Frame-Options'],'DENY');
  assert.equal(prod['Referrer-Policy'],'strict-origin-when-cross-origin');
  assert.equal(prod['Content-Security-Policy'],"frame-ancestors 'none'");
  assert.equal(prod['Strict-Transport-Security'],'max-age=31536000');
  assert.equal('Cross-Origin-Resource-Policy' in prod,false);

  const dev=securityResponseHeaders({production:false});
  assert.equal('Strict-Transport-Security' in dev,false);
});

test('Vercel serves the SPA with the expected low-risk security headers',()=>{
  const config=JSON.parse(fs.readFileSync(new URL('../frontend/vercel.json',import.meta.url),'utf8'));
  const rule=config.headers.find(x=>x.source==='/(.*)');
  assert.ok(rule);
  const headers=Object.fromEntries(rule.headers.map(x=>[x.key,x.value]));
  assert.equal(headers['X-Content-Type-Options'],'nosniff');
  assert.equal(headers['X-Frame-Options'],'DENY');
  assert.equal(headers['Content-Security-Policy'],"frame-ancestors 'none'");
  assert.equal(headers['Strict-Transport-Security'],'max-age=31536000');
  assert.equal(headers['Permissions-Policy'],undefined);
});

test('private API surfaces are explicitly non-cacheable while public data stays cache-neutral',()=>{
  for(const path of ['/api/auth/login','/api/auth/register','/api/me','/api/me/league','/api/admin/status']){
    const headers=privateResponseHeaders(path);
    assert.equal(headers['Cache-Control'],'no-store');
    assert.equal(headers.Pragma,'no-cache');
  }
  assert.deepEqual(privateResponseHeaders('/api/ranking'),{});
  assert.deepEqual(privateResponseHeaders('/api/legal/versions'),{});
});
