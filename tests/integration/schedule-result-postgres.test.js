import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const connectionString=process.env.TEST_DATABASE_URL;
if(!connectionString)throw new Error('TEST_DATABASE_URL es obligatorio para los tests PostgreSQL');
process.env.DATABASE_URL=connectionString;

const {Pool}=pg;
const testPool=new Pool({connectionString});
const {assignWheel,proposeSchedule,acceptSchedule,submitResult,confirmResult,maintenance,publicUpcoming}=await import('../../src/wheel.js');
const {resolveDispute}=await import('../../src/admin.js');
const {pool:appPool}=await import('../../src/db.js');
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const schema=fs.readFileSync(path.resolve(__dirname,'../../database/schema.sql'),'utf8');

async function resetDb(){
  await testPool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await testPool.query(schema);
}
beforeEach(resetDb);
after(async()=>{await testPool.end();await appPool.end();});

async function league(){
  return (await testPool.query("SELECT id FROM leagues WHERE slug='masculino'")).rows[0];
}
async function category(number=5){
  return (await testPool.query("SELECT c.* FROM categories c JOIN leagues l ON l.id=c.league_id WHERE l.slug='masculino' AND c.number=$1",[number])).rows[0];
}
let seq=0;
async function seedUser({categoryNumber=5,role='player'}={}){
  seq++;
  return (await testPool.query(`
    INSERT INTO users(first_name,last_name,dni,phone,password_hash,gender,role,verification_status,verified_at,current_category_number)
    VALUES($1,$2,$3,$4,'x','male',$5,'verified',now(),$6) RETURNING *
  `,['U'+seq,'Test'+seq,String(32000000+seq),'+54933292'+String(10000+seq),role,categoryNumber])).rows[0];
}
async function seedTeam(position,{categoryNumber=5,waitingDaysAgo=3}={}){
  const l=await league(),c=await category(categoryNumber);
  const members=[await seedUser({categoryNumber}),await seedUser({categoryNumber})];
  const pair=(await testPool.query(`
    INSERT INTO pairs(league_id,category_id,position,waiting_since)
    VALUES($1,$2,$3,$4) RETURNING *
  `,[l.id,c.id,position,new Date(Date.now()-waitingDaysAgo*86400000)])).rows[0];
  for(const u of members){
    await testPool.query('INSERT INTO pair_members(pair_id,user_id) VALUES($1,$2)',[pair.id,u.id]);
    await testPool.query('INSERT INTO active_pair_memberships(user_id,pair_id) VALUES($1,$2)',[u.id,pair.id]);
  }
  return {pair,members};
}
async function seedAssignedMatch(){
  const top=await seedTeam(1,{waitingDaysAgo:5});
  const lower=await seedTeam(2,{waitingDaysAgo:4});
  const wheel=await assignWheel();
  assert.equal(Number(wheel.created),1);
  const assignment=(await testPool.query('SELECT * FROM wheel_assignments ORDER BY id DESC LIMIT 1')).rows[0];
  return {top,lower,assignment};
}
function scoreForWinner(a,winnerId,variant=0){
  const aWins=Number(a.pair_a_id)===Number(winnerId);
  if(variant===1)return {sets:aWins?[{kind:'set',pairA:7,pairB:5},{kind:'set',pairA:6,pairB:4}]:[{kind:'set',pairA:5,pairB:7},{kind:'set',pairA:4,pairB:6}]};
  return {sets:aWins?[{kind:'set',pairA:6,pairB:2},{kind:'set',pairA:6,pairB:3}]:[{kind:'set',pairA:2,pairB:6},{kind:'set',pairA:3,pairB:6}]};
}
function resultBody(a,winnerId,playedAt=new Date(),variant=0){
  return {winnerPairId:Number(winnerId),resultType:'normal',playedAt:playedAt.toISOString(),score:scoreForWinner(a,winnerId,variant)};
}
test('official schedule changes only after rival acceptance and proposals expire in 48 hours',async()=>{
  const {top,lower,assignment}=await seedAssignedMatch();
  const firstDate=new Date(Date.now()+2*86400000);
  const p1=await proposeSchedule(top.members[0].id,assignment.id,{scheduledAt:firstDate.toISOString(),locationText:'Club escrito por jugador'});
  const hours=(new Date(p1.response_deadline_at)-new Date(p1.created_at))/3600000;
  assert.ok(Math.abs(hours-48)<0.01);
  let dbAssignment=(await testPool.query('SELECT * FROM wheel_assignments WHERE id=$1',[assignment.id])).rows[0];
  assert.equal(dbAssignment.scheduled_at,null);
  assert.equal((await publicUpcoming()).some(x=>Number(x.id)===Number(assignment.id)),false);

  await acceptSchedule(lower.members[0].id,assignment.id,p1.id);
  dbAssignment=(await testPool.query('SELECT * FROM wheel_assignments WHERE id=$1',[assignment.id])).rows[0];
  assert.equal(new Date(dbAssignment.scheduled_at).getTime(),firstDate.getTime());
  assert.equal(dbAssignment.location_text,'Club escrito por jugador');
  assert.equal(dbAssignment.venue_id,null);
  const publicRow=(await publicUpcoming()).find(x=>Number(x.id)===Number(assignment.id));
  assert.ok(publicRow);
  assert.equal(publicRow.location_text,'Club escrito por jugador');

  const secondDate=new Date(Date.now()+3*86400000);
  const p2=await proposeSchedule(top.members[1].id,assignment.id,{scheduledAt:secondDate.toISOString(),locationText:'Otra cancha libre'});
  dbAssignment=(await testPool.query('SELECT * FROM wheel_assignments WHERE id=$1',[assignment.id])).rows[0];
  assert.equal(new Date(dbAssignment.scheduled_at).getTime(),firstDate.getTime());
  await acceptSchedule(lower.members[1].id,assignment.id,p2.id);
  dbAssignment=(await testPool.query('SELECT * FROM wheel_assignments WHERE id=$1',[assignment.id])).rows[0];
  assert.equal(new Date(dbAssignment.scheduled_at).getTime(),secondDate.getTime());
  assert.equal(dbAssignment.location_text,'Otra cancha libre');
});

test('first result can be revised before response, keeps one 15-day deadline, and opponent confirmation applies ladder once',async()=>{
  const {top,lower,assignment}=await seedAssignedMatch();
  const playedAt=new Date();
  const first=await submitResult(lower.members[0].id,assignment.id,resultBody(assignment,lower.pair.id,playedAt,0));
  assert.equal(first.status,'result_pending');
  let a=(await testPool.query('SELECT * FROM wheel_assignments WHERE id=$1',[assignment.id])).rows[0];
  const deadline=new Date(a.confirmation_deadline_at);
  const days=(deadline-new Date())/86400000;
  assert.ok(days>14.9&&days<15.1);

  await submitResult(lower.members[1].id,assignment.id,resultBody(assignment,lower.pair.id,playedAt,1));
  const version=(await testPool.query('SELECT * FROM wheel_result_versions WHERE assignment_id=$1',[assignment.id])).rows[0];
  assert.equal(Number(version.version_no),2);
  a=(await testPool.query('SELECT * FROM wheel_assignments WHERE id=$1',[assignment.id])).rows[0];
  assert.equal(new Date(a.confirmation_deadline_at).getTime(),deadline.getTime());

  const confirmed=await confirmResult(top.members[0].id,assignment.id);
  assert.equal(confirmed.status,'confirmed');
  const matchCount=Number((await testPool.query('SELECT count(*) n FROM matches WHERE assignment_id=$1',[assignment.id])).rows[0].n);
  assert.equal(matchCount,1);
  const positions=(await testPool.query('SELECT id,position FROM pairs WHERE id=ANY($1::bigint[]) ORDER BY position',[[top.pair.id,lower.pair.id]])).rows;
  assert.equal(Number(positions[0].id),Number(lower.pair.id));
  assert.equal(Number(positions[0].position),1);
  assert.equal(Number(positions[1].position),2);
  assert.equal(Number((await testPool.query('SELECT count(*) n FROM wheel_assignment_participants WHERE assignment_id=$1',[assignment.id])).rows[0].n),0);
  await assert.rejects(()=>confirmResult(top.members[0].id,assignment.id));
  assert.equal(Number((await testPool.query('SELECT count(*) n FROM matches WHERE assignment_id=$1',[assignment.id])).rows[0].n),1);
});

test('matching result versions confirm automatically',async()=>{
  const {top,lower,assignment}=await seedAssignedMatch();
  const playedAt=new Date();
  const raw=resultBody(assignment,top.pair.id,playedAt);
  assert.equal((await submitResult(top.members[0].id,assignment.id,raw)).status,'result_pending');
  const second=await submitResult(lower.members[0].id,assignment.id,raw);
  assert.equal(second.status,'confirmed');
  const match=(await testPool.query('SELECT * FROM matches WHERE assignment_id=$1',[assignment.id])).rows[0];
  assert.equal(match.resolution_source,'matching_versions');
  assert.equal(Number(match.winner_pair_id),Number(top.pair.id));
});

test('incompatible versions become a dispute and admin selection confirms once and notifies both pairs',async()=>{
  const {top,lower,assignment}=await seedAssignedMatch();
  const admin=await seedUser({role:'admin'});
  const playedAt=new Date();
  await submitResult(top.members[0].id,assignment.id,resultBody(assignment,top.pair.id,playedAt));
  const disputed=await submitResult(lower.members[0].id,assignment.id,resultBody(assignment,lower.pair.id,playedAt));
  assert.equal(disputed.status,'disputed');
  const selected=(await testPool.query('SELECT * FROM wheel_result_versions WHERE assignment_id=$1 AND pair_id=$2',[assignment.id,top.pair.id])).rows[0];

  await resolveDispute(admin.id,assignment.id,{action:'select',versionId:selected.id});
  const a=(await testPool.query('SELECT status,close_reason FROM wheel_assignments WHERE id=$1',[assignment.id])).rows[0];
  assert.equal(a.status,'confirmed');
  assert.equal(a.close_reason,'admin_dispute');
  assert.equal(Number((await testPool.query('SELECT count(*) n FROM matches WHERE assignment_id=$1',[assignment.id])).rows[0].n),1);
  const match=(await testPool.query('SELECT * FROM matches WHERE assignment_id=$1',[assignment.id])).rows[0];
  assert.equal(Number(match.winner_pair_id),Number(top.pair.id));
  assert.equal(match.resolution_source,'admin_dispute');
  assert.equal(Number((await testPool.query("SELECT count(*) n FROM notifications WHERE type='result_confirmed'")).rows[0].n),4);
  assert.equal(Number((await testPool.query("SELECT count(*) n FROM admin_audit_events WHERE action='dispute_resolve' AND target_id=$1",[String(assignment.id)])).rows[0].n),1);
});

test('admin can void an incompatible dispute without inventing a match and both pairs are notified',async()=>{
  const {top,lower,assignment}=await seedAssignedMatch();
  const admin=await seedUser({role:'admin'});
  const playedAt=new Date();
  await submitResult(top.members[0].id,assignment.id,resultBody(assignment,top.pair.id,playedAt));
  await submitResult(lower.members[0].id,assignment.id,resultBody(assignment,lower.pair.id,playedAt));
  await resolveDispute(admin.id,assignment.id,{action:'void'});
  const a=(await testPool.query('SELECT status,close_reason FROM wheel_assignments WHERE id=$1',[assignment.id])).rows[0];
  assert.equal(a.status,'void');
  assert.equal(a.close_reason,'admin_void');
  assert.equal(Number((await testPool.query('SELECT count(*) n FROM matches WHERE assignment_id=$1',[assignment.id])).rows[0].n),0);
  assert.equal(Number((await testPool.query('SELECT count(*) n FROM wheel_assignment_participants WHERE assignment_id=$1',[assignment.id])).rows[0].n),0);
  assert.equal(Number((await testPool.query("SELECT count(*) n FROM notifications WHERE type='result_void'")).rows[0].n),4);
});

test('single result auto-validates after 15 days of silence through maintenance',async()=>{
  const {top,assignment}=await seedAssignedMatch();
  const playedAt=new Date();
  await submitResult(top.members[0].id,assignment.id,resultBody(assignment,top.pair.id,playedAt));
  await testPool.query("UPDATE wheel_assignments SET confirmation_deadline_at=now()-interval '1 second' WHERE id=$1",[assignment.id]);
  await maintenance();
  const a=(await testPool.query('SELECT status,close_reason FROM wheel_assignments WHERE id=$1',[assignment.id])).rows[0];
  assert.equal(a.status,'confirmed');
  assert.equal(a.close_reason,'silence_15_days');
  const match=(await testPool.query('SELECT * FROM matches WHERE assignment_id=$1',[assignment.id])).rows[0];
  assert.equal(match.resolution_source,'silence_15_days');
});

test('result cannot be loaded after the 30-day sporting deadline',async()=>{
  const {top,assignment}=await seedAssignedMatch();
  await testPool.query("UPDATE wheel_assignments SET deadline_at=now()-interval '1 second' WHERE id=$1",[assignment.id]);
  await assert.rejects(
    ()=>submitResult(top.members[0].id,assignment.id,resultBody(assignment,top.pair.id,new Date(Date.now()-60000))),
    /Venció el plazo/
  );
  assert.equal(Number((await testPool.query('SELECT count(*) n FROM wheel_result_versions WHERE assignment_id=$1',[assignment.id])).rows[0].n),0);
});


test('schedule location is free text and does not require a registered venue',async()=>{
  const {top,assignment}=await seedAssignedMatch();
  const when=new Date(Date.now()+86400000);
  const p=await proposeSchedule(top.members[0].id,assignment.id,{scheduledAt:when.toISOString(),locationText:'  Cancha de Juan   al fondo  '});
  assert.equal(p.location_text,'Cancha de Juan al fondo');
  assert.equal(p.venue_id,null);
  await assert.rejects(()=>proposeSchedule(top.members[0].id,assignment.id,{scheduledAt:when.toISOString(),locationText:' '}),/lugar válido/);
});
