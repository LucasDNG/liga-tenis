import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('service worker always returns a Response and falls back to SPA shell for navigations',async()=>{
  const source=await readFile(new URL('../frontend/public/sw.js',import.meta.url),'utf8');
  assert.match(source,/url\.origin!==self\.location\.origin/);
  assert.match(source,/url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(source,/e\.request\.mode==='navigate'/);
  assert.match(source,/caches\.match\('\/'\)/);
  assert.match(source,/return Response\.error\(\)/);
});
