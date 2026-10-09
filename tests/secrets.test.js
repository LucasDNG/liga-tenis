import test from 'node:test';
import assert from 'node:assert/strict';
import {base32,productionSecrets} from '../src/secrets.js';

test('production secret generator emits strong independent JWT and 160-bit Base32 TOTP',()=>{
  let call=0;
  const randomBytes=n=>{
    call++;
    return Buffer.alloc(n,call);
  };
  const result=productionSecrets({account:'admin@example.com',randomBytes});
  assert.ok(result.jwtSecret.length>=64);
  assert.match(result.jwtSecret,/^[A-Za-z0-9_-]+$/);
  assert.equal(result.totpSecret.length,32);
  assert.match(result.totpSecret,/^[A-Z2-7]+$/);
  assert.notEqual(result.jwtSecret,result.totpSecret);
  const uri=new URL(result.otpauthUri);
  assert.equal(uri.protocol,'otpauth:');
  assert.equal(uri.searchParams.get('secret'),result.totpSecret);
  assert.equal(uri.searchParams.get('issuer'),'LA RED Tenis');
  assert.equal(uri.searchParams.get('digits'),'6');
  assert.equal(uri.searchParams.get('period'),'30');
});

test('base32 encoding is deterministic and padding-free',()=>{
  assert.equal(base32(Buffer.from('hello')),'NBSWY3DP');
});
