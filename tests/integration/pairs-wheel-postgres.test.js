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
const {acceptInvitation}=await import('../../src/pairs.js');
const {assignWheel}=await import('../../src/wheel.js');
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
let userSeq=0;
async function seedUser({categoryNumber=5}={}){
  userSeq++;
  return (await testPool.query(`
    INSERT INTO users(first_name,last_name,dni,phone,password_hash,gender,verification_status,verified_at,current_category_number)
    VALUES($1,$2,$3,$4,'x','male','verified',now(),$5) RETURNING *
  `,['U'+userSeq,'Test'+userSeq,String(31000000+userSeq),'+54933291'+String(10000+userSeq),categoryNumber])).rows[0];
}
async function seedInvitation(inviter,invitee,categoryNumber=5){
  return (await testPool.query(`
    INSERT INTO pair_invitations(inviter_user_id,invitee_user_id,requested_category_number,resulting_category_number)
    VALUES($1,$2,$3,$3) RETURNING *
  `,[inviter.id,invitee.id,categoryNumber])).rows[0];
}
async function seedWheelPair({position,waitingDaysAgo,categoryNumber=5}){
  const l=await league(),c=await category(categoryNumber);
  const waiting=new Date(Date.now()-waitingDaysAgo*24*60*60*1000);
  return (await testPool.query(`
    INSERT INTO pairs(league_id,category_id,position,waiting_since)
    VALUES($1,$2,$3,$4) RETURNING *
  `,[l.id,c.id,position,waiting])).rows[0];
}

test('two unrelated invitation acceptances in the same category serialize and both form valid pairs',async()=>{
  const [u1,u2,u3,u4]=await Promise.all([seedUser(),seedUser(),seedUser(),seedUser()]);
  const [i1,i2]=await Promise.all([seedInvitation(u1,u2),seedInvitation(u3,u4)]);
  const [p1,p2]=await Promise.all([acceptInvitation(u2.id,i1.id),acceptInvitation(u4.id,i2.id)]);
  assert.notEqual(Number(p1.id),Number(p2.id));
  const c=await category(5);
  const pairs=(await testPool.query(`
    SELECT id,position,elo FROM pairs WHERE category_id=$1 AND competition_state='active' ORDER BY position
  `,[c.id])).rows;
  assert.deepEqual(pairs.map(r=>Number(r.position)),[1,2]);
  assert.deepEqual(pairs.map(r=>Number(r.elo)),[0,0]);
  const memberships=(await testPool.query('SELECT user_id,pair_id FROM active_pair_memberships ORDER BY user_id')).rows;
  assert.equal(memberships.length,4);
  assert.equal(new Set(memberships.map(r=>Number(r.user_id))).size,4);
});

test('concurrent invitations sharing one player cannot create two active memberships or deadlock',{timeout:5000},async()=>{
  const [a,b,target]=await Promise.all([seedUser(),seedUser(),seedUser()]);
  const [i1,i2]=await Promise.all([seedInvitation(a,target),seedInvitation(b,target)]);
  const settled=await Promise.allSettled([
    acceptInvitation(target.id,i1.id),
    acceptInvitation(target.id,i2.id)
  ]);
  assert.equal(settled.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(settled.filter(x=>x.status==='rejected').length,1);
  const targetMemberships=Number((await testPool.query('SELECT count(*) n FROM active_pair_memberships WHERE user_id=$1',[target.id])).rows[0].n);
  assert.equal(targetMemberships,1);
  const pairs=Number((await testPool.query("SELECT count(*) n FROM pairs WHERE competition_state='active'")).rows[0].n);
  assert.equal(pairs,1);
  const accepted=Number((await testPool.query("SELECT count(*) n FROM pair_invitations WHERE status='accepted'")).rows[0].n);
  assert.equal(accepted,1);
});

test('two concurrent wheel runs create each assignment once and never double-book a pair',async()=>{
  for(let i=1;i<=4;i++)await seedWheelPair({position:i,waitingDaysAgo:10-i});
  const [a,b]=await Promise.all([assignWheel(),assignWheel()]);
  assert.equal(Number(a.created)+Number(b.created),2);
  const assignments=(await testPool.query('SELECT * FROM wheel_assignments ORDER BY id')).rows;
  assert.equal(assignments.length,2);
  for(const row of assignments){
    const days=(new Date(row.deadline_at)-new Date(row.assigned_at))/(24*60*60*1000);
    assert.ok(Math.abs(days-30)<0.01);
  }
  const participants=(await testPool.query('SELECT pair_id,count(*) n FROM wheel_assignment_participants GROUP BY pair_id ORDER BY pair_id')).rows;
  assert.equal(participants.length,4);
  assert.ok(participants.every(r=>Number(r.n)===1));
});

test('odd category leaves the newest waiter on bye and assigns every older waiter',async()=>{
  const newest=await seedWheelPair({position:1,waitingDaysAgo:1});
  const oldest=await seedWheelPair({position:2,waitingDaysAgo:5});
  const older2=await seedWheelPair({position:3,waitingDaysAgo:4});
  const older3=await seedWheelPair({position:4,waitingDaysAgo:3});
  const older4=await seedWheelPair({position:5,waitingDaysAgo:2});
  const result=await assignWheel();
  assert.equal(Number(result.created),2);
  const assigned=(await testPool.query('SELECT pair_id FROM wheel_assignment_participants ORDER BY pair_id')).rows.map(r=>Number(r.pair_id));
  assert.equal(assigned.includes(Number(newest.id)),false);
  for(const p of [oldest,older2,older3,older4])assert.equal(assigned.includes(Number(p.id)),true);
  const waiting=(await testPool.query('SELECT waiting_since FROM pairs WHERE id=$1',[newest.id])).rows[0].waiting_since;
  assert.ok(waiting);
});

test('a single eligible pair waits without assignment, deadline or sanction',async()=>{
  const only=await seedWheelPair({position:1,waitingDaysAgo:7});
  const before=(await testPool.query('SELECT waiting_since,position_debt,monthly_miss_streak FROM pairs WHERE id=$1',[only.id])).rows[0];
  const result=await assignWheel();
  assert.equal(Number(result.created),0);
  assert.equal(Number((await testPool.query('SELECT count(*) n FROM wheel_assignments')).rows[0].n),0);
  const after=(await testPool.query('SELECT waiting_since,position_debt,monthly_miss_streak FROM pairs WHERE id=$1',[only.id])).rows[0];
  assert.equal(new Date(after.waiting_since).getTime(),new Date(before.waiting_since).getTime());
  assert.equal(Number(after.position_debt),0);
  assert.equal(Number(after.monthly_miss_streak),0);
});
