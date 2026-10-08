import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import bcrypt from 'bcrypt';

const connectionString=process.env.TEST_DATABASE_URL;
if(!connectionString)throw new Error('TEST_DATABASE_URL es obligatorio para los tests PostgreSQL');
process.env.DATABASE_URL=connectionString;

const {Pool}=pg;
const testPool=new Pool({connectionString});
const {reportDiscipline}=await import('../../src/discipline.js');
const {setLeagueClockPause,verifyTotp}=await import('../../src/admin.js');
const {queueUserNotification,dispatchWhatsAppOutbox}=await import('../../src/notifications.js');
const {pool:appPool}=await import('../../src/db.js');
const {app}=await import('../../src/app.js');
const {readHealth}=await import('../../src/health.js');
const {applyProductionMigrations}=await import('../../src/migrations.js');
const {databasePreflight}=await import('../../src/preflight.js');
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const schema=fs.readFileSync(path.resolve(__dirname,'../../database/schema.sql'),'utf8');
const verifySql=fs.readFileSync(path.resolve(__dirname,'../../database/verify.sql'),'utf8');

async function resetDb(){
  await testPool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await testPool.query(schema);
}
beforeEach(resetDb);
after(async()=>{await testPool.end();await appPool.end();});

async function league(){return (await testPool.query("SELECT id FROM leagues WHERE slug='masculino'")).rows[0];}
async function category(number=5){return (await testPool.query("SELECT c.* FROM categories c JOIN leagues l ON l.id=c.league_id WHERE l.slug='masculino' AND c.number=$1",[number])).rows[0];}
let seq=0;
async function seedUser({categoryNumber=5,role='player',verification='verified',resubmit=false}={}){
  seq++;
  return (await testPool.query(`
    INSERT INTO users(first_name,last_name,dni,phone,password_hash,gender,role,verification_status,verified_at,current_category_number,identity_resubmit_requested_at)
    VALUES($1,$2,$3,$4,'x','male',$5,$6::varchar(20),CASE WHEN $6::varchar(20)='verified' THEN now() ELSE NULL END,$7,CASE WHEN $8 THEN now() ELSE NULL END)
    RETURNING *
  `,['H'+seq,'Test'+seq,String(34000000+seq),'+54933294'+String(10000+seq),role,verification,categoryNumber,resubmit])).rows[0];
}
async function seedTeam(position,{categoryNumber=5}={}){
  const l=await league(),c=await category(categoryNumber);
  const members=[await seedUser({categoryNumber}),await seedUser({categoryNumber})];
  const pair=(await testPool.query('INSERT INTO pairs(league_id,category_id,position,waiting_since) VALUES($1,$2,$3,now()) RETURNING *',[l.id,c.id,position])).rows[0];
  for(const u of members){
    await testPool.query('INSERT INTO pair_members(pair_id,user_id) VALUES($1,$2)',[pair.id,u.id]);
    await testPool.query('INSERT INTO active_pair_memberships(user_id,pair_id) VALUES($1,$2)',[u.id,pair.id]);
  }
  return {pair,members};
}
async function historicalAssignment(pairA,pairB,status='confirmed'){
  const l=await league(),c=await category(5);
  return (await testPool.query(`
    INSERT INTO wheel_assignments(league_id,category_id,pair_a_id,pair_b_id,status,closed_at,close_reason)
    VALUES($1,$2,$3,$4,$5,now(),'seed') RETURNING *
  `,[l.id,c.id,pairA.id,pairB.id,status])).rows[0];
}
async function openAssignment(pairA,pairB){
  const l=await league(),c=await category(5);
  const a=(await testPool.query('INSERT INTO wheel_assignments(league_id,category_id,pair_a_id,pair_b_id) VALUES($1,$2,$3,$4) RETURNING *',[l.id,c.id,pairA.id,pairB.id])).rows[0];
  await testPool.query('INSERT INTO wheel_assignment_participants(assignment_id,pair_id) VALUES($1,$2),($1,$3)',[a.id,pairA.id,pairB.id]);
  return a;
}

test('three distinct reporters set pair observed and five set review',async()=>{
  const target=await seedTeam(1);
  const reporters=[];
  for(let i=0;i<5;i++)reporters.push(await seedTeam(i+2));
  for(let i=0;i<5;i++){
    const a=await historicalAssignment(reporters[i].pair,target.pair);
    await reportDiscipline(reporters[i].members[0].id,{assignmentId:a.id,targetPairId:target.pair.id,reason:'misconduct',details:'conducta'});
    const state=(await testPool.query('SELECT discipline_state FROM pairs WHERE id=$1',[target.pair.id])).rows[0].discipline_state;
    if(i<2)assert.equal(state,'clear');
    if(i===2||i===3)assert.equal(state,'observed');
    if(i===4)assert.equal(state,'review');
  }
});

test('violence report against a player triggers immediate review and neutrally closes current unplayed assignment',async()=>{
  const reporter=await seedTeam(1);
  const target=await seedTeam(2);
  const neutral=await seedTeam(3);
  const past=await historicalAssignment(reporter.pair,target.pair);
  const current=await openAssignment(target.pair,neutral.pair);
  await reportDiscipline(reporter.members[0].id,{assignmentId:past.id,targetUserId:target.members[0].id,reason:'violence',details:'hecho grave'});
  const user=(await testPool.query('SELECT discipline_state FROM users WHERE id=$1',[target.members[0].id])).rows[0];
  assert.equal(user.discipline_state,'review');
  const closed=(await testPool.query('SELECT status,close_reason FROM wheel_assignments WHERE id=$1',[current.id])).rows[0];
  assert.equal(closed.status,'cancelled');
  assert.equal(closed.close_reason,'player_discipline');
  assert.equal(Number((await testPool.query('SELECT count(*) n FROM matches WHERE assignment_id=$1',[current.id])).rows[0].n),0);
  assert.equal(Number((await testPool.query('SELECT count(*) n FROM wheel_assignment_participants WHERE assignment_id=$1',[current.id])).rows[0].n),0);
  assert.equal(Number((await testPool.query("SELECT count(*) n FROM notifications WHERE type='discipline_assignment_closed'")).rows[0].n),4);
});

test('global clock pause shifts every live deadline by the paused duration and is audited',async()=>{
  const admin=await seedUser({role:'admin'});
  const a=await seedTeam(1),b=await seedTeam(2);
  const assignment=await openAssignment(a.pair,b.pair);
  await testPool.query(`
    UPDATE wheel_assignments
    SET deadline_at=now()+interval '10 days',
        extraordinary_deadline_at=now()+interval '20 days',
        confirmation_deadline_at=now()+interval '5 days'
    WHERE id=$1
  `,[assignment.id]);
  const proposal=(await testPool.query(`
    INSERT INTO wheel_schedule_proposals(assignment_id,proposed_by_pair_id,scheduled_at,location_text,response_deadline_at)
    VALUES($1,$2,now()+interval '2 days','Lugar libre',now()+interval '1 day') RETURNING *
  `,[assignment.id,a.pair.id])).rows[0];
  const noShow=(await testPool.query(`
    INSERT INTO wheel_no_shows(assignment_id,reported_by_pair_id,reported_pair_id,response_deadline_at)
    VALUES($1,$2,$3,now()+interval '1 day') RETURNING *
  `,[assignment.id,a.pair.id,b.pair.id])).rows[0];
  const invitee=await seedUser();
  const invitation=(await testPool.query(`
    INSERT INTO pair_invitations(inviter_user_id,invitee_user_id,requested_category_number,resulting_category_number,expires_at)
    VALUES($1,$2,5,5,now()+interval '7 days') RETURNING *
  `,[a.members[0].id,invitee.id])).rows[0];
  const dissolution=(await testPool.query(`
    INSERT INTO pair_dissolution_requests(pair_id,requested_by_user_id,deadline_at)
    VALUES($1,$2,now()+interval '7 days') RETURNING *
  `,[a.pair.id,a.members[0].id])).rows[0];

  const before={
    assignment:(await testPool.query('SELECT deadline_at,extraordinary_deadline_at,confirmation_deadline_at FROM wheel_assignments WHERE id=$1',[assignment.id])).rows[0],
    proposal:(await testPool.query('SELECT response_deadline_at FROM wheel_schedule_proposals WHERE id=$1',[proposal.id])).rows[0],
    noShow:(await testPool.query('SELECT response_deadline_at FROM wheel_no_shows WHERE id=$1',[noShow.id])).rows[0],
    invitation:(await testPool.query('SELECT expires_at FROM pair_invitations WHERE id=$1',[invitation.id])).rows[0],
    dissolution:(await testPool.query('SELECT deadline_at FROM pair_dissolution_requests WHERE id=$1',[dissolution.id])).rows[0],
  };

  await setLeagueClockPause(admin.id,true);
  await testPool.query("UPDATE app_settings SET value=to_jsonb((now()-interval '2 hours')::text) WHERE key='league_clock_pause_started_at'");
  await setLeagueClockPause(admin.id,false);

  const after={
    assignment:(await testPool.query('SELECT deadline_at,extraordinary_deadline_at,confirmation_deadline_at FROM wheel_assignments WHERE id=$1',[assignment.id])).rows[0],
    proposal:(await testPool.query('SELECT response_deadline_at FROM wheel_schedule_proposals WHERE id=$1',[proposal.id])).rows[0],
    noShow:(await testPool.query('SELECT response_deadline_at FROM wheel_no_shows WHERE id=$1',[noShow.id])).rows[0],
    invitation:(await testPool.query('SELECT expires_at FROM pair_invitations WHERE id=$1',[invitation.id])).rows[0],
    dissolution:(await testPool.query('SELECT deadline_at FROM pair_dissolution_requests WHERE id=$1',[dissolution.id])).rows[0],
  };

  const deltas=[
    [before.assignment.deadline_at,after.assignment.deadline_at],
    [before.assignment.extraordinary_deadline_at,after.assignment.extraordinary_deadline_at],
    [before.assignment.confirmation_deadline_at,after.assignment.confirmation_deadline_at],
    [before.proposal.response_deadline_at,after.proposal.response_deadline_at],
    [before.noShow.response_deadline_at,after.noShow.response_deadline_at],
    [before.invitation.expires_at,after.invitation.expires_at],
    [before.dissolution.deadline_at,after.dissolution.deadline_at],
  ].map(([x,y])=>(new Date(y)-new Date(x))/1000);
  for(const seconds of deltas)assert.ok(seconds>=7198&&seconds<=7202,'deadline shift '+seconds);
  const settings=(await testPool.query("SELECT key,value FROM app_settings WHERE key IN('league_clock_paused','league_clock_pause_started_at') ORDER BY key")).rows;
  assert.equal(settings.find(x=>x.key==='league_clock_paused').value,false);
  assert.equal(settings.find(x=>x.key==='league_clock_pause_started_at').value,null);
  assert.equal(Number((await testPool.query("SELECT count(*) n FROM admin_audit_events WHERE action='league_clock' AND admin_user_id=$1",[admin.id])).rows[0].n),2);
});

test('notification and WhatsApp outbox dedupe keys remain idempotent',async()=>{
  const user=await seedUser();
  const client=await testPool.connect();
  try{
    await client.query('BEGIN');
    const msg={userId:user.id,type:'test_event',title:'Test',body:'Una sola vez',payload:{x:1},dedupeKey:'hardening:dedupe'};
    await queueUserNotification(client,msg);
    await queueUserNotification(client,msg);
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  assert.equal(Number((await testPool.query("SELECT count(*) n FROM notifications WHERE dedupe_key='hardening:dedupe'")).rows[0].n),1);
  assert.equal(Number((await testPool.query("SELECT count(*) n FROM notification_outbox WHERE dedupe_key='wa:hardening:dedupe'")).rows[0].n),1);
});

function decodeBase32(s){
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';
  for(const c of s.replace(/=+$/,'').toUpperCase()){const i=alphabet.indexOf(c);if(i>=0)bits+=i.toString(2).padStart(5,'0');}
  const out=[];for(let i=0;i+8<=bits.length;i+=8)out.push(parseInt(bits.slice(i,i+8),2));return Buffer.from(out);
}
function currentTotp(secret){
  const key=decodeBase32(secret),counter=Math.floor(Date.now()/1000/30),buf=Buffer.alloc(8);buf.writeBigUInt64BE(BigInt(counter));
  const h=crypto.createHmac('sha1',key).update(buf).digest(),off=h[h.length-1]&15;
  const n=((h[off]&0x7f)<<24)|((h[off+1]&255)<<16)|((h[off+2]&255)<<8)|(h[off+3]&255);
  return String(n%1000000).padStart(6,'0');
}

test('TOTP accepts a valid current code and rejects a wrong code',()=>{
  const secret='JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
  assert.equal(verifyTotp(secret,currentTotp(secret)),true);
  assert.equal(verifyTotp(secret,'000000')&&currentTotp(secret)!=='000000',false);
  assert.equal(verifyTotp('',currentTotp(secret)),false);
});

test('verify.sql allows pending identity without documents only while a resubmission is outstanding',async()=>{
  const ordinary=await seedUser({verification:'pending',resubmit:false});
  const resubmit=await seedUser({verification:'pending',resubmit:true});
  const statement=verifySql
    .split(';')
    .map(x=>x.trim())
    .find(x=>x.includes("u.verification_status='pending'")&&x.includes('d.user_id IS NULL'));
  assert.ok(statement);
  const rows=(await testPool.query(statement)).rows.map(r=>Number(r.id));
  assert.equal(rows.includes(Number(ordinary.id)),true);
  assert.equal(rows.includes(Number(resubmit.id)),false);
});


test('WhatsApp outbox retries failed rows and marks them sent after a successful retry',async()=>{
  const user=await seedUser();
  const client=await testPool.connect();
  try{
    await client.query('BEGIN');
    await queueUserNotification(client,{
      userId:user.id,
      type:'retry_test',
      title:'Retry',
      body:'Mensaje de prueba',
      payload:{x:1},
      dedupeKey:'hardening:retry'
    });
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}

  const oldEnv={
    id:process.env.WHATSAPP_PHONE_NUMBER_ID,
    token:process.env.WHATSAPP_ACCESS_TOKEN,
    template:process.env.WHATSAPP_TEMPLATE_NAME,
    version:process.env.WHATSAPP_GRAPH_VERSION,
    lang:process.env.WHATSAPP_TEMPLATE_LANGUAGE
  };
  const oldFetch=globalThis.fetch;
  process.env.WHATSAPP_PHONE_NUMBER_ID='123';
  process.env.WHATSAPP_ACCESS_TOKEN='token';
  process.env.WHATSAPP_TEMPLATE_NAME='la_red_test';
  process.env.WHATSAPP_GRAPH_VERSION='v26.0';
  process.env.WHATSAPP_TEMPLATE_LANGUAGE='es_AR';

  let calls=0,lastUrl='';
  globalThis.fetch=async(url)=>{
    calls++;lastUrl=String(url);
    if(calls===1)return {ok:false,status:500,text:async()=>JSON.stringify({error:{message:'recipient +5493329555000 failed',code:131000,error_subcode:2494073}})};
    return {ok:true,status:200,text:async()=> ''};
  };

  try{
    const first=await dispatchWhatsAppOutbox();
    assert.equal(first.failed,1);
    let row=(await testPool.query("SELECT status,attempts,last_error FROM notification_outbox WHERE dedupe_key='wa:hardening:retry'")).rows[0];
    assert.equal(row.status,'failed');
    assert.equal(Number(row.attempts),1);
    assert.match(row.last_error,/WhatsApp HTTP 500 code=131000 subcode=2494073/);
    assert.equal(row.last_error.includes('+5493329555000'),false);
    assert.match(lastUrl,/graph\.facebook\.com\/v26\.0\/123\/messages$/);

    await testPool.query("UPDATE notification_outbox SET next_attempt_at=now()-interval '1 second' WHERE dedupe_key='wa:hardening:retry'");
    const second=await dispatchWhatsAppOutbox();
    assert.equal(second.sent,1);
    row=(await testPool.query("SELECT status,attempts,last_error,sent_at FROM notification_outbox WHERE dedupe_key='wa:hardening:retry'")).rows[0];
    assert.equal(row.status,'sent');
    assert.equal(Number(row.attempts),2);
    assert.equal(row.last_error,null);
    assert.ok(row.sent_at);
  }finally{
    globalThis.fetch=oldFetch;
    if(oldEnv.id===undefined)delete process.env.WHATSAPP_PHONE_NUMBER_ID;else process.env.WHATSAPP_PHONE_NUMBER_ID=oldEnv.id;
    if(oldEnv.token===undefined)delete process.env.WHATSAPP_ACCESS_TOKEN;else process.env.WHATSAPP_ACCESS_TOKEN=oldEnv.token;
    if(oldEnv.template===undefined)delete process.env.WHATSAPP_TEMPLATE_NAME;else process.env.WHATSAPP_TEMPLATE_NAME=oldEnv.template;
    if(oldEnv.version===undefined)delete process.env.WHATSAPP_GRAPH_VERSION;else process.env.WHATSAPP_GRAPH_VERSION=oldEnv.version;
    if(oldEnv.lang===undefined)delete process.env.WHATSAPP_TEMPLATE_LANGUAGE;else process.env.WHATSAPP_TEMPLATE_LANGUAGE=oldEnv.lang;
  }
});


test('production migration is idempotent and leaves abandonment schema ready',async()=>{
  const client=await testPool.connect();
  try{
    const first=await applyProductionMigrations(client);
    const second=await applyProductionMigrations(client);
    assert.equal(first.ok,true);
    assert.equal(second.ok,true);
    assert.ok(first.applied.includes('PATCH_MATCH_ABANDONMENT_2026-09-21.sql'));
    const column=Number((await client.query(`
      SELECT count(*) n FROM information_schema.columns
      WHERE table_schema='public' AND table_name='matches' AND column_name='abandoned_pair_id'
    `)).rows[0].n);
    const constraint=Number((await client.query(`
      SELECT count(*) n FROM pg_constraint
      WHERE conname='matches_abandonment_consistency' AND conrelid='matches'::regclass
    `)).rows[0].n);
    assert.equal(column,1);
    assert.equal(constraint,1);
  }finally{client.release();}
});

test('health check verifies PostgreSQL and wheel-v2 engine instead of returning static green',async()=>{
  const healthy=await readHealth(testPool);
  assert.equal(healthy.ok,true);
  assert.equal(healthy.database,'ok');
  assert.equal(healthy.engine,'wheel-v2');
  await testPool.query(`UPDATE app_settings SET value='"broken-engine"'::jsonb WHERE key='engine'`);
  await assert.rejects(()=>readHealth(testPool),/Motor competitivo inesperado/);
});


test('production migrations serialize concurrent startup callers with an advisory lock',async()=>{
  const one=await testPool.connect();
  const two=await testPool.connect();
  try{
    const [a,b]=await Promise.all([
      applyProductionMigrations(one),
      applyProductionMigrations(two)
    ]);
    assert.equal(a.ok,true);
    assert.equal(b.ok,true);
    const locks=Number((await testPool.query(`
      SELECT count(*) n
      FROM pg_locks
      WHERE locktype='advisory'
        AND classid=7331
        AND objid=20260921
        AND granted=true
    `)).rows[0].n);
    assert.equal(locks,0);
  }finally{
    one.release();
    two.release();
  }
});


test('production admin login fails closed without TOTP secret and succeeds with valid TOTP',async()=>{
  const password='AdminPass-2026!';
  const hash=await bcrypt.hash(password,10);
  const admin=(await testPool.query(`
    INSERT INTO users(first_name,last_name,dni,phone,password_hash,gender,role,verification_status,verified_at,current_category_number)
    VALUES('Admin','Prod','35999111','+5493329555111',$1,'male','admin','verified',now(),5)
    RETURNING *
  `,[hash])).rows[0];

  const oldEnv={
    nodeEnv:process.env.NODE_ENV,
    totp:process.env.ADMIN_TOTP_SECRET,
    jwt:process.env.JWT_SECRET,
  };
  process.env.NODE_ENV='production';
  process.env.JWT_SECRET='integration-jwt-secret-0123456789abcdef0123456789abcdef';
  delete process.env.ADMIN_TOTP_SECRET;

  const server=await new Promise((resolve,reject)=>{
    const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));
    instance.once('error',reject);
  });
  const address=server.address();
  const url=`http://127.0.0.1:${address.port}/api/auth/admin-login`;

  try{
    const missing=await fetch(url,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({dni:admin.dni,password,totp:'000000'})
    });
    assert.equal(missing.status,503);

    const secret='JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
    process.env.ADMIN_TOTP_SECRET=secret;
    const valid=await fetch(url,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({dni:admin.dni,password,totp:currentTotp(secret)})
    });
    assert.equal(valid.status,200);
    const body=await valid.json();
    assert.ok(body.token);
    assert.equal(body.user.role,'admin');
  }finally{
    await new Promise(resolve=>server.close(resolve));
    if(oldEnv.nodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldEnv.nodeEnv;
    if(oldEnv.totp===undefined)delete process.env.ADMIN_TOTP_SECRET;else process.env.ADMIN_TOTP_SECRET=oldEnv.totp;
    if(oldEnv.jwt===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldEnv.jwt;
  }
});


test('database preflight passes healthy state and fails closed for paused clock or missing abandonment patch',async()=>{
  const admin=await seedUser({role:'admin'});
  assert.ok(admin.id);
  const healthy=await databasePreflight(testPool,{requireTls:false});
  assert.equal(healthy.ok,true);
  assert.equal(healthy.engine,'wheel-v2');
  assert.equal(healthy.clockPaused,false);
  assert.equal(healthy.migrationReady,true);
  assert.equal(healthy.activeCommercialVenues,0);
  assert.ok(healthy.verifyControls>0);

  await testPool.query("UPDATE app_settings SET value='true'::jsonb WHERE key='league_clock_paused'");
  await assert.rejects(()=>databasePreflight(testPool,{requireTls:false}),/reloj global de la liga está pausado/);

  await testPool.query("UPDATE app_settings SET value='false'::jsonb WHERE key='league_clock_paused'");
  await testPool.query('ALTER TABLE matches DROP CONSTRAINT matches_abandonment_consistency');
  await assert.rejects(()=>databasePreflight(testPool,{requireTls:false}),/Patch de abandono incompleto/);
});
