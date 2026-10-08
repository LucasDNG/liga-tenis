import test from 'node:test';
import assert from 'node:assert/strict';
import {databaseTlsInfo} from '../src/preflight.js';

test('preflight TLS inspecciona el transporte real del cliente PostgreSQL',()=>{
  const secure=databaseTlsInfo({connection:{stream:{
    encrypted:true,
    getProtocol:()=> 'TLSv1.3',
    getCipher:()=>({name:'TLS_AES_256_GCM_SHA384'}),
  }}});
  assert.deepEqual(secure,{ssl:true,version:'TLSv1.3',cipher:'TLS_AES_256_GCM_SHA384'});

  const plain=databaseTlsInfo({connection:{stream:{encrypted:false}}});
  assert.deepEqual(plain,{ssl:false,version:null,cipher:null});
});
