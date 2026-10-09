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
const {applySportingResult}=await import('../../src/competitionEngine.js');
const {contestNoShow}=await import('../../src/wheel.js');
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
async function category(number){
  return (await testPool.query("SELECT c.* FROM categories c JOIN leagues l ON l.id=c.league_id WHERE l.slug='masculino' AND c.number=$1",[number])).rows[0];
}
async function seedPairs(categoryNumber,count,{losses={},wins={},debts={}}={}){
  const l=await league(),c=await category(categoryNumber),out=[];
  for(let position=1;position<=count;position++){
    const row=(await testPool.query(`INSERT INTO pairs(league_id,category_id,position,consecutive_wins,consecutive_losses,position_debt) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[
      l.id,c.id,position,Number(wins[position]||0),Number(losses[position]||0),Number(debts[position]||0)
    ])).rows[0];
    out.push(row);
  }
  return out;
}
async function assignment(categoryNumber,pairA,pairB){
  const l=await league(),c=await category(categoryNumber);
  return (await testPool.query(`INSERT INTO wheel_assignments(league_id,category_id,pair_a_id,pair_b_id) VALUES($1,$2,$3,$4) RETURNING *`,[l.id,c.id,pairA.id,pairB.id])).rows[0];
}
const score={sets:[{kind:'set',pairA:6,pairB:2},{kind:'set',pairA:6,pairB:3}]};
async function applyOnce(a,winnerPairId,source='integration'){
  const client=await testPool.connect();
  try{
    await client.query('BEGIN');
    const result=await applySportingResult(client,{assignment:a,winnerPairId,resultType:'normal',score,playedAt:new Date('2026-09-20T18:00:00-03:00'),source});
    await client.query('COMMIT');
    return result;
  }catch(e){
    await client.query('ROLLBACK');
    throw e;
  }finally{client.release();}
}

test('gap 4 keeps the relegation threshold at three losses',async()=>{
  const current=await seedPairs(3,6,{losses:{6:1}});
  await seedPairs(4,2);
  const a=await assignment(3,current[1],current[5]);
  await applyOnce(a,current[1].id);
  const loser=(await testPool.query(`SELECT p.*,c.number category_number FROM pairs p JOIN categories c ON c.id=p.category_id WHERE p.id=$1`,[current[5].id])).rows[0];
  assert.equal(Number(loser.category_number),3);
  assert.equal(Number(loser.consecutive_losses),2);
});

test('gap 5 relegates on the second loss, enters base #2 and recalculates ELO',async()=>{
  const current=await seedPairs(3,7,{losses:{7:1}});
  const lower=await seedPairs(4,2);
  const a=await assignment(3,current[1],current[6]);
  await applyOnce(a,current[1].id);
  const loser=(await testPool.query(`SELECT p.*,c.number category_number FROM pairs p JOIN categories c ON c.id=p.category_id WHERE p.id=$1`,[current[6].id])).rows[0];
  assert.equal(Number(loser.category_number),4);
  assert.equal(Number(loser.position),2);
  assert.equal(Number(loser.consecutive_losses),0);
  assert.equal(Number(loser.elo),1000);
  const order=(await testPool.query(`SELECT id,position FROM pairs WHERE category_id=$1 AND competition_state='active' ORDER BY position`,[(await category(4)).id])).rows;
  assert.deepEqual(order.map(r=>Number(r.position)),[1,2,3]);
  assert.equal(Number(order[0].id),Number(lower[0].id));
  assert.equal(Number((await testPool.query("SELECT count(*) n FROM competitive_events WHERE event_type='relegation' AND pair_id=$1",[loser.id])).rows[0].n),1);
});

test('relegation debt pushes entry down and preserves unmaterialized debt',async()=>{
  const current=await seedPairs(3,7,{losses:{7:1},debts:{7:3}});
  await seedPairs(4,2);
  const a=await assignment(3,current[1],current[6]);
  await applyOnce(a,current[1].id);
  const loser=(await testPool.query(`SELECT p.*,c.number category_number FROM pairs p JOIN categories c ON c.id=p.category_id WHERE p.id=$1`,[current[6].id])).rows[0];
  assert.equal(Number(loser.category_number),4);
  assert.equal(Number(loser.position),3);
  assert.equal(Number(loser.position_debt),2);
});

test('promotion enters at the bottom of the active block',async()=>{
  await seedPairs(2,3);
  const current=await seedPairs(3,4,{wins:{1:2}});
  const a=await assignment(3,current[0],current[1]);
  await applyOnce(a,current[0].id);
  const winner=(await testPool.query(`SELECT p.*,c.number category_number FROM pairs p JOIN categories c ON c.id=p.category_id WHERE p.id=$1`,[current[0].id])).rows[0];
  assert.equal(Number(winner.category_number),2);
  assert.equal(Number(winner.position),4);
  assert.equal(Number(winner.consecutive_wins),0);
});

test('concurrent retries of the same sporting result apply exactly once',async()=>{
  const current=await seedPairs(3,4);
  const a=await assignment(3,current[1],current[3]);
  const run=()=>applyOnce(a,current[1].id,'concurrent-retry');
  const [one,two]=await Promise.all([run(),run()]);
  assert.equal(Number(one.id),Number(two.id));
  assert.equal(Number((await testPool.query('SELECT count(*) n FROM matches WHERE assignment_id=$1',[a.id])).rows[0].n),1);
  assert.equal(Number((await testPool.query("SELECT count(*) n FROM competitive_events WHERE source_key=$1",[`match:${a.id}:confirmed`])).rows[0].n),1);
  const loser=(await testPool.query('SELECT consecutive_losses FROM pairs WHERE id=$1',[current[3].id])).rows[0];
  assert.equal(Number(loser.consecutive_losses),1);
});

test('concurrent promotion and relegation into the same target category keep unique contiguous positions',async()=>{
  const cat2=await seedPairs(2,7,{losses:{7:1}});
  await seedPairs(3,2);
  const cat4=await seedPairs(4,4,{wins:{1:2}});
  const relegationAssignment=await assignment(2,cat2[1],cat2[6]);
  const promotionAssignment=await assignment(4,cat4[0],cat4[1]);
  await Promise.all([
    applyOnce(relegationAssignment,cat2[1].id,'concurrent-relegation'),
    applyOnce(promotionAssignment,cat4[0].id,'concurrent-promotion')
  ]);
  const c3=await category(3);
  const rows=(await testPool.query(`SELECT position FROM pairs WHERE category_id=$1 AND competition_state='active' ORDER BY position`,[c3.id])).rows;
  assert.equal(rows.length,4);
  assert.deepEqual(rows.map(r=>Number(r.position)),[1,2,3,4]);
  assert.equal(new Set(rows.map(r=>Number(r.position))).size,4);
});

test('contested no-show penalizes position but does not create attributable miss strikes',async()=>{
  const l=await league(),c=await category(5);
  const users=[];
  for(let i=0;i<2;i++){
    users.push((await testPool.query(`INSERT INTO users(first_name,last_name,dni,phone,password_hash,gender,verification_status,verified_at,current_category_number) VALUES($1,$2,$3,$4,'x','male','verified',now(),5) RETURNING *`,[
      'U'+i,'Test'+i,String(30000000+i),'+54933290000'+i
    ])).rows[0]);
  }
  const pairs=[];
  for(let i=0;i<2;i++){
    const p=(await testPool.query(`INSERT INTO pairs(league_id,category_id,position,monthly_miss_streak) VALUES($1,$2,$3,1) RETURNING *`,[l.id,c.id,i+1])).rows[0];
    await testPool.query('INSERT INTO pair_members(pair_id,user_id) VALUES($1,$2)',[p.id,users[i].id]);
    await testPool.query('INSERT INTO active_pair_memberships(user_id,pair_id) VALUES($1,$2)',[users[i].id,p.id]);
    pairs.push(p);
  }
  const a=(await testPool.query(`INSERT INTO wheel_assignments(league_id,category_id,pair_a_id,pair_b_id,scheduled_at,location_text,schedule_confirmed_at) VALUES($1,$2,$3,$4,now()-interval '1 hour','Lugar de prueba',now()-interval '2 hours') RETURNING *`,[l.id,c.id,pairs[0].id,pairs[1].id])).rows[0];
  await testPool.query('INSERT INTO wheel_assignment_participants(assignment_id,pair_id) VALUES($1,$2),($1,$3)',[a.id,pairs[0].id,pairs[1].id]);
  await testPool.query(`INSERT INTO wheel_no_shows(assignment_id,reported_by_pair_id,reported_pair_id,response_deadline_at) VALUES($1,$2,$3,now()+interval '1 hour')`,[a.id,pairs[0].id,pairs[1].id]);
  await contestNoShow(users[1].id,a.id);
  const streaks=(await testPool.query('SELECT monthly_miss_streak FROM pairs ORDER BY id')).rows.map(r=>Number(r.monthly_miss_streak));
  assert.deepEqual(streaks,[1,1]);
  const closed=(await testPool.query('SELECT status,close_reason FROM wheel_assignments WHERE id=$1',[a.id])).rows[0];
  assert.equal(closed.status,'expired');
  assert.equal(closed.close_reason,'no_show_contested');
});
