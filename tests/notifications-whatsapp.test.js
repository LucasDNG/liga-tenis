import test from 'node:test';
import assert from 'node:assert/strict';
import {sendWhatsAppTemplate} from '../src/notifications.js';

test('WhatsApp sender never calls Meta if any of the five variables is missing',async()=>{
  const values={WHATSAPP_PHONE_NUMBER_ID:'123',WHATSAPP_ACCESS_TOKEN:'fake',WHATSAPP_TEMPLATE_NAME:'notice',WHATSAPP_GRAPH_VERSION:'v23.0',WHATSAPP_TEMPLATE_LANGUAGE:'es_AR'};
  const previous={...process.env};
  const originalFetch=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async()=>{calls++;throw new Error('Unexpected network call');};
  try{
    for(const key of Object.keys(values)){
      Object.assign(process.env,values);
      delete process.env[key];
      await assert.rejects(sendWhatsAppTemplate('5493329123456',{body:'x'}),/WhatsApp (incompleto|Graph version no configurada)/);
    }
    assert.equal(calls,0);
  }finally{
    globalThis.fetch=originalFetch;
    for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];
    Object.assign(process.env,previous);
  }
});

test('WhatsApp template sender uses configured Meta endpoint without leaking payload semantics',async()=>{
  const previous={...process.env};
  process.env.WHATSAPP_GRAPH_VERSION='v23.0';
  process.env.WHATSAPP_PHONE_NUMBER_ID='123456789';
  process.env.WHATSAPP_ACCESS_TOKEN='secret-token';
  process.env.WHATSAPP_TEMPLATE_NAME='la_red_notification';
  process.env.WHATSAPP_TEMPLATE_LANGUAGE='es_AR';

  const originalFetch=globalThis.fetch;
  let seen=null;
  globalThis.fetch=async(url,options)=>{
    seen={url,options,body:JSON.parse(options.body)};
    return new Response(JSON.stringify({messages:[{id:'wamid.test'}]}),{status:200});
  };

  try{
    await sendWhatsAppTemplate('+54 9 3329 123456',{body:'Mensaje de prueba'});
    assert.equal(seen.url,'https://graph.facebook.com/v23.0/123456789/messages');
    assert.equal(seen.options.method,'POST');
    assert.equal(seen.options.headers.Authorization,'Bearer secret-token');
    assert.equal(seen.body.messaging_product,'whatsapp');
    assert.equal(seen.body.to,'5493329123456');
    assert.equal(seen.body.template.name,'la_red_notification');
    assert.equal(seen.body.template.language.code,'es_AR');
    assert.equal(seen.body.template.components[0].parameters[0].text,'Mensaje de prueba');
  }finally{
    globalThis.fetch=originalFetch;
    for(const key of Object.keys(process.env)){
      if(!(key in previous))delete process.env[key];
    }
    Object.assign(process.env,previous);
  }
});

test('WhatsApp sender rejects malformed Graph version before network call',async()=>{
  const previous=process.env.WHATSAPP_GRAPH_VERSION;
  process.env.WHATSAPP_GRAPH_VERSION='latest';
  try{
    await assert.rejects(
      sendWhatsAppTemplate('5493329123456',{body:'x'}),
      /Graph version no configurada/,
    );
  }finally{
    if(previous===undefined)delete process.env.WHATSAPP_GRAPH_VERSION;
    else process.env.WHATSAPP_GRAPH_VERSION=previous;
  }
});
