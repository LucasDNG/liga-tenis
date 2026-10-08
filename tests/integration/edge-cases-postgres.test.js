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
const {assignWheel,maintenance,voteExtension,reportNoShow,submitResult,confirmResult}=await import('../../src/wheel.js');
const {requestPause,requestDissolution}=await import('../../src/pairs.js');
const {recalcCategoryElos}=await import('../../src/competitionEngine.js');
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
async function seedUser({categoryNumber=5}={}){
  seq++;
  return (await testPool.query(`
    INSERT INTO users(first_name,last_name,dni,phone,password_hash,gender,verification_status,verified_at,current_category_number)
    VALUES($1,$2,$3,$4,'x','male','verified',now(),$5) RETURNING *
  `,['E'+seq,'Test'+seq,String(33000000+seq),'+54933293'+String(10000+seq),categoryNumber])).rows[0];
}
async function seedTeam(position,{categoryNumber=5,waitingDaysAgo=3,missStreak=0}={}){
  const l=await league(),c=await category(categoryNumber);
  const members=[await seedUser({categoryNumber}),await seedUser({categoryNumber})];
  const pair=(await testPool.query(`
    INSERT INTO pairs(league_id,category_id,position,waiting_since,monthly_miss_streak)
    VALUES($1,$2,$3,$4,$5) RETURNING *
  `,[l.id,c.id,position,new Date(Date.now()-waitingDaysAgo*86400000),missStreak])).rows[0];
  for(const u of members){
    await testPool.query('INSERT INTO pair_members(pair_id,user_id) VALUES($1,$2)',[pair.id,u.id]);
    await testPool.query('INSERT INTO active_pair_memberships(user_id,pair_id) VALUES($1,$2)',[u.id,pair.id]);
  }
  return {pair,members};
}
async function seedAssignedMatch(optsA={},optsB={}){
  const a=await seedTeam(1,{waitingDaysAgo:5,...optsA});
  const b=await seedTeam(2,{waitingDaysAgo:4,...optsB});
  const wheel=await assignWheel();
  assert.equal(Number(wheel.created),1);
  const assignment=(await testPool.query('SELECT * FROM wheel_assignments ORDER BY id DESC LIMIT 1')).rows[0];
  return {a,b,assignment};
}
async function seedVenue(){
  return (await testPool.query("INSERT INTO venues(name,active) VALUES('Edge Club',true) RETURNING *")).rows[0];
}
function scoreForWinner(a,winnerId){
  const aWins=Number(a.pair_a_id)===Number(winnerId);
  return {sets:aWins?[{kind:'set',pairA:6,pairB:2},{kind:'set',pairA:6,pairB:3}]:[{kind:'set',pairA:2,pairB:6},{kind:'set',pairA:3,pairB:6}]};
}
function resultBody(a,winnerId){
  return {winnerPairId:Number(winnerId),resultType:'normal',playedAt:new Date().toISOString(),score:scoreForWinner(a,winnerId)};
}
async function ageAssignment(assignmentId){
  await testPool.query(`
    UPDATE wheel_assignments
    SET assigned_at=now()-interval '32 days 1 hour',
        deadline_at=now()-interval '49 hours'
    WHERE id=$1
  `,[assignmentId]);
  return (await testPool.query('SELECT * FROM wheel_assignments WHERE id=$1',[assignmentId])).rows[0];
}
async function insertHistoricalProposal(assignment,pairId,hoursBeforeDeadline,status='expired'){
  const v=await seedVenue();
  const created=new Date(new Date(assignment.deadline_at).getTime()-hoursBeforeDeadline*3600000);
  return (await testPool.query(`
    INSERT INTO wheel_schedule_proposals(
      assignment_id,proposed_by_pair_id,scheduled_at,location_text,venue_id,status,response_deadline_at,created_at,responded_at
    ) VALUES($1,$2,$3,'Lugar de prueba',$4,$5,$6,$7,$7) RETURNING *
  `,[
    assignment.id,pairId,new Date(new Date(assignment.deadline_at).getTime()-3600000),v.id,status,
    new Date(created.getTime()+48*3600000),created
  ])).rows[0];
}

test('one timely actor and no rival action penalizes only the non-responder',async()=>{
  const {a,b,assignment}=await seedAssignedMatch();
  const aged=await ageAssignment(assignment.id);
  await insertHistoricalProposal(aged,a.pair.id,72);
  await maintenance();
  const rows=(await testPool.query('SELECT id,position_debt,monthly_miss_streak,consecutive_losses FROM pairs WHERE id=ANY($1::bigint[]) ORDER BY id',[[a.pair.id,b.pair.id]])).rows;
  const byId=Object.fromEntries(rows.map(r=>[Number(r.id),r]));
  assert.equal(Number(byId[a.pair.id].position_debt),0);
  assert.equal(Number(byId[a.pair.id].monthly_miss_streak),0);
  assert.equal(Number(byId[b.pair.id].position_debt),1);
  assert.equal(Number(byId[b.pair.id].monthly_miss_streak),1);
  assert.equal(Number(byId[b.pair.id].consecutive_losses),0);
});

test('timely proposal plus late rival action counts as both acted and penalizes both',async()=>{
  const {a,b,assignment}=await seedAssignedMatch();
  const aged=await ageAssignment(assignment.id);
  await insertHistoricalProposal(aged,a.pair.id,72,'replaced');
  await insertHistoricalProposal(aged,b.pair.id,6,'expired');
  await maintenance();
  const rows=(await testPool.query('SELECT id,position_debt,monthly_miss_streak FROM pairs WHERE id=ANY($1::bigint[]) ORDER BY id',[[a.pair.id,b.pair.id]])).rows;
  assert.deepEqual(rows.map(r=>Number(r.position_debt)),[1,1]);
  assert.deepEqual(rows.map(r=>Number(r.monthly_miss_streak)),[1,1]);
});

test('extension activates only inside the technical 48-hour window and lasts 15 days from original deadline',async()=>{
  const {a,b,assignment}=await seedAssignedMatch();
  await testPool.query("UPDATE wheel_assignments SET deadline_at=now()-interval '1 hour' WHERE id=$1",[assignment.id]);
  const before=(await testPool.query('SELECT deadline_at FROM wheel_assignments WHERE id=$1',[assignment.id])).rows[0];
  const first=await voteExtension(a.members[0].id,assignment.id);
  assert.deepEqual(first,{votes:1,activated:false});
  const second=await voteExtension(b.members[0].id,assignment.id);
  assert.deepEqual(second,{votes:2,activated:true});
  const row=(await testPool.query('SELECT extraordinary_used,extraordinary_deadline_at FROM wheel_assignments WHERE id=$1',[assignment.id])).rows[0];
  assert.equal(row.extraordinary_used,true);
  const days=(new Date(row.extraordinary_deadline_at)-new Date(before.deadline_at))/86400000;
  assert.ok(Math.abs(days-15)<0.001);
});

test('extension vote is rejected after the 48-hour technical window',async()=>{
  const {a,assignment}=await seedAssignedMatch();
  await testPool.query("UPDATE wheel_assignments SET deadline_at=now()-interval '49 hours' WHERE id=$1",[assignment.id]);
  await assert.rejects(()=>voteExtension(a.members[0].id,assignment.id),/Venció la ventana de 48 horas/);
  assert.equal(Number((await testPool.query('SELECT count(*) n FROM wheel_extension_votes WHERE assignment_id=$1',[assignment.id])).rows[0].n),0);
});

test('expired extraordinary extension penalizes position but not sporting loss or attributable miss streak',async()=>{
  const {a,b,assignment}=await seedAssignedMatch({missStreak:1},{missStreak:1});
  await testPool.query(`
    UPDATE wheel_assignments
    SET deadline_at=now()-interval '16 days',
        extraordinary_used=true,
        extraordinary_deadline_at=now()-interval '1 hour'
    WHERE id=$1
  `,[assignment.id]);
  await maintenance();
  const old=(await testPool.query('SELECT status,close_reason FROM wheel_assignments WHERE id=$1',[assignment.id])).rows[0];
  assert.equal(old.status,'expired');
  assert.equal(old.close_reason,'extraordinary_expired');
  const rows=(await testPool.query('SELECT position_debt,monthly_miss_streak,consecutive_losses FROM pairs WHERE id=ANY($1::bigint[]) ORDER BY id',[[a.pair.id,b.pair.id]])).rows;
  assert.deepEqual(rows.map(r=>Number(r.position_debt)),[1,1]);
  assert.deepEqual(rows.map(r=>Number(r.monthly_miss_streak)),[1,1]);
  assert.deepEqual(rows.map(r=>Number(r.consecutive_losses)),[0,0]);
});

test('uncontested no-show is attributable, gives one positional penalty, and second strike auto-pauses reported pair',async()=>{
  const {a,b,assignment}=await seedAssignedMatch({missStreak:1},{missStreak:1});
  await testPool.query(`
    UPDATE wheel_assignments
    SET scheduled_at=now()-interval '1 hour',location_text='Lugar de prueba',schedule_confirmed_at=now()-interval '2 hours'
    WHERE id=$1
  `,[assignment.id]);
  await reportNoShow(a.members[0].id,assignment.id);
  await testPool.query("UPDATE wheel_no_shows SET response_deadline_at=now()-interval '1 second' WHERE assignment_id=$1",[assignment.id]);
  await maintenance();
  const reporter=(await testPool.query('SELECT competition_state,monthly_miss_streak FROM pairs WHERE id=$1',[a.pair.id])).rows[0];
  const reported=(await testPool.query('SELECT competition_state,monthly_miss_streak,position_debt,consecutive_losses FROM pairs WHERE id=$1',[b.pair.id])).rows[0];
  assert.equal(reporter.competition_state,'active');
  assert.equal(Number(reporter.monthly_miss_streak),0);
  assert.equal(reported.competition_state,'paused');
  assert.equal(Number(reported.monthly_miss_streak),2);
  assert.equal(Number(reported.position_debt),1);
  assert.equal(Number(reported.consecutive_losses),0);
});

test('voluntary pause preserves miss streak and recalculates positional ELO for remaining active pairs',async()=>{
  const p1=await seedTeam(1,{waitingDaysAgo:5});
  const p2=await seedTeam(2,{waitingDaysAgo:4});
  const p3=await seedTeam(3,{waitingDaysAgo:3,missStreak:1});
  const l=await league();
  await testPool.query(`
    INSERT INTO matches(league_id,category_number,pair_a_id,pair_b_id,winner_pair_id,result_type,played_at,resolution_source)
    VALUES
      ($1,5,$2,$3,$2,'normal',now(),'seed'),
      ($1,5,$3,$4,$3,'normal',now(),'seed')
  `,[l.id,p1.pair.id,p2.pair.id,p3.pair.id]);
  const c=await category(5),client=await testPool.connect();
  try{await recalcCategoryElos(client,c.id);}finally{client.release();}
  const before=(await testPool.query('SELECT elo FROM pairs WHERE id=$1',[p2.pair.id])).rows[0];
  assert.equal(Number(before.elo),1000);
  await requestPause(p3.members[0].id,false);
  await requestPause(p3.members[1].id,false);
  const paused=(await testPool.query('SELECT competition_state,elo,monthly_miss_streak FROM pairs WHERE id=$1',[p3.pair.id])).rows[0];
  const remaining=(await testPool.query('SELECT elo FROM pairs WHERE id=$1',[p2.pair.id])).rows[0];
  assert.equal(paused.competition_state,'paused');
  assert.equal(Number(paused.elo),0);
  assert.equal(Number(paused.monthly_miss_streak),1);
  assert.equal(Number(remaining.elo),0);
});

test('pause after current takes effect only after the sporting result closes the assignment',async()=>{
  const {a,b,assignment}=await seedAssignedMatch();
  await requestPause(a.members[0].id,true);
  await requestPause(a.members[1].id,true);
  let pair=(await testPool.query('SELECT competition_state,pause_after_current FROM pairs WHERE id=$1',[a.pair.id])).rows[0];
  assert.equal(pair.competition_state,'active');
  assert.equal(pair.pause_after_current,true);
  await submitResult(b.members[0].id,assignment.id,resultBody(assignment,b.pair.id));
  await confirmResult(a.members[0].id,assignment.id);
  pair=(await testPool.query('SELECT competition_state,pause_after_current,elo FROM pairs WHERE id=$1',[a.pair.id])).rows[0];
  assert.equal(pair.competition_state,'paused');
  assert.equal(pair.pause_after_current,false);
  assert.equal(Number(pair.elo),0);
});

test('dissolution deadline with an unplayed assignment creates sporting forfeit before archive',async()=>{
  const {a,b,assignment}=await seedAssignedMatch();
  const request=await requestDissolution(a.members[0].id);
  await testPool.query("UPDATE pair_dissolution_requests SET deadline_at=now()-interval '1 second' WHERE id=$1",[request.id]);
  await maintenance();
  const match=(await testPool.query('SELECT * FROM matches WHERE assignment_id=$1',[assignment.id])).rows[0];
  assert.ok(match);
  assert.equal(match.result_type,'dissolution_forfeit');
  assert.equal(Number(match.winner_pair_id),Number(b.pair.id));
  const dissolved=(await testPool.query('SELECT competition_state FROM pairs WHERE id=$1',[a.pair.id])).rows[0];
  assert.equal(dissolved.competition_state,'inactive');
  assert.equal(Number((await testPool.query('SELECT count(*) n FROM active_pair_memberships WHERE pair_id=$1',[a.pair.id])).rows[0].n),0);
  const d=(await testPool.query('SELECT status FROM pair_dissolution_requests WHERE id=$1',[request.id])).rows[0];
  assert.equal(d.status,'applied');
});

test('dissolution with a loaded result waits for result resolution before archiving',async()=>{
  const {a,b,assignment}=await seedAssignedMatch();
  const request=await requestDissolution(a.members[0].id);
  await testPool.query("UPDATE pair_dissolution_requests SET deadline_at=now()-interval '1 second' WHERE id=$1",[request.id]);
  await submitResult(a.members[0].id,assignment.id,resultBody(assignment,b.pair.id));
  await maintenance();
  let d=(await testPool.query('SELECT status FROM pair_dissolution_requests WHERE id=$1',[request.id])).rows[0];
  let pair=(await testPool.query('SELECT competition_state FROM pairs WHERE id=$1',[a.pair.id])).rows[0];
  assert.equal(d.status,'awaiting_result');
  assert.equal(pair.competition_state,'active');
  await confirmResult(b.members[0].id,assignment.id);
  await maintenance();
  d=(await testPool.query('SELECT status FROM pair_dissolution_requests WHERE id=$1',[request.id])).rows[0];
  pair=(await testPool.query('SELECT competition_state FROM pairs WHERE id=$1',[a.pair.id])).rows[0];
  assert.equal(d.status,'applied');
  assert.equal(pair.competition_state,'inactive');
});
