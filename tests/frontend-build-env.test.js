import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {productionApiUrl} from '../frontend/buildEnv.js';
import {frontendReleaseSha,injectFrontendReleaseMeta} from '../frontend/releaseMeta.js';

test('frontend production API URL requires canonical HTTPS /api endpoint',()=>{
  assert.equal(productionApiUrl('https://api.example.com/api'),'https://api.example.com/api');
  assert.equal(productionApiUrl('https://api.example.com/api/'),'https://api.example.com/api');
});

test('frontend production API URL rejects missing, insecure or mispathed values',()=>{
  assert.throws(()=>productionApiUrl(''),/obligatorio/);
  assert.throws(()=>productionApiUrl('http://api.example.com/api'),/HTTPS/);
  assert.throws(()=>productionApiUrl('https://api.example.com'),/\/api/);
  assert.throws(()=>productionApiUrl('https://api.example.com/api?v=1'),/credenciales\/query\/fragmento/);
});


test('frontend release helper injects the deployment commit into HTML',()=>{
  const sha='0123456789abcdef0123456789abcdef01234567';
  assert.equal(frontendReleaseSha({VERCEL_GIT_COMMIT_SHA:sha}),sha);
  assert.equal(frontendReleaseSha({VITE_VERCEL_GIT_COMMIT_SHA:sha}),sha);
  const html=injectFrontendReleaseMeta('<html><head></head><body></body></html>',sha);
  assert.match(html,/name="la-red-release" content="0123456789abcdef0123456789abcdef01234567"/);
});


test('Vercel skips only documentation-only commits so backend/frontend release SHAs stay aligned',()=>{
  const config=JSON.parse(fs.readFileSync(new URL('../frontend/vercel.json',import.meta.url),'utf8'));
  assert.equal(config.ignoreCommand,"git -C .. diff --quiet HEAD^ HEAD -- ':!*.md' ':!**/*.md'");
});


test('Vercel ignore command skips docs-only commits but rebuilds for code changes',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'la-red-vercel-filter-'));
  const front=path.join(root,'frontend');
  fs.mkdirSync(front,{recursive:true});

  const git=(args,cwd=root)=>{
    const result=spawnSync('git',args,{cwd,encoding:'utf8'});
    if(result.status!==0)throw new Error(result.stderr||result.stdout||`git failed: ${args.join(' ')}`);
    return result;
  };

  git(['init']);
  git(['config','user.email','ci@example.com']);
  git(['config','user.name','CI']);
  fs.writeFileSync(path.join(front,'app.js'),'console.log("v1");\n');
  fs.writeFileSync(path.join(root,'README.md'),'initial\n');
  git(['add','.']);
  git(['commit','-m','initial']);

  fs.writeFileSync(path.join(root,'README.md'),'docs only\n');
  git(['add','README.md']);
  git(['commit','-m','docs']);

  let diff=spawnSync('git',['-C','..','diff','--quiet','HEAD^','HEAD','--',':!*.md',':!**/*.md'],{cwd:front});
  assert.equal(diff.status,0,'docs-only commit must be skipped');

  fs.writeFileSync(path.join(front,'app.js'),'console.log("v2");\n');
  git(['add','frontend/app.js']);
  git(['commit','-m','code']);

  diff=spawnSync('git',['-C','..','diff','--quiet','HEAD^','HEAD','--',':!*.md',':!**/*.md'],{cwd:front});
  assert.equal(diff.status,1,'code commit must trigger a build');

  fs.rmSync(root,{recursive:true,force:true});
});
