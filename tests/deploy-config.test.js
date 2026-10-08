import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Render ignores documentation-only commits so deployment SHA stays aligned with Vercel',()=>{
  const yaml=fs.readFileSync(new URL('../render.yaml',import.meta.url),'utf8');
  assert.match(yaml,/autoDeployTrigger:\s*checksPass/);
  assert.match(yaml,/buildFilter:/);
  assert.match(yaml,/ignoredPaths:/);
  assert.match(yaml,/- "\*\.md"/);
  assert.match(yaml,/- "\*\*\/\*\.md"/);
});
