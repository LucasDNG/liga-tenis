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
const {submitResult,confirmResult}=await import('../../src/wheel.js');
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
let seq=0;
async function seedPair(categoryNumber,position,{wins=0,losses=0,miss=0}={}){
  const l=await league(),c=await category(categoryNumber),members=[];
  const pair=(await testPool.query(
    `INSERT INTO pairs(league_id,category_id,position,consecutive_wins,consecutive_losses,monthly_miss_streak,waiting_since)
     VALUES($1,$2,$3,$4,$5,$6,now()) RETURNING *`,
    [l.id,c.id,position,wins,losses,miss]
  )).rows[0];
  for(let i=0;i<2;i++){
    seq++;
    const u=(await testPool.query(
      `INSERT INTO users(first_name,last_name,dni,phone,password_hash,gender,verification_status,verified_at,current_category_number)
       VALUES($1,$2,$3,$4,'x','male','verified',now(),$5) RETURNING *`,
      ['I'+seq,'Test'+seq,String(35000000+seq),'+54933295'+String(10000+seq),categoryNumber]
    )).rows[0];
    await testPool.query('INSERT INTO pair_members(pair_id,user_id) VALUES($1,$2)',[pair.id,u.id]);
    await testPool.query('INSERT INTO active_pair_memberships(user_id,pair_id) VALUES($1,$2)',[u.id,pair.id]);
    members.push(u);
  }
  return {pair,members};
}
async function assignment(categoryNumber,a,b){
  const l=await league(),c=await category(categoryNumber);
  const row=(await testPool.query(
    `INSERT INTO wheel_assignments(league_id,category_id,pair_a_id,pair_b_id)
     VALUES($1,$2,$3,$4) RETURNING *`,
    [l.id,c.id,a.pair.id,b.pair.id]
  )).rows[0];
  await testPool.query(
    'INSERT INTO wheel_assignment_participants(assignment_id,pair_id) VALUES($1,$2),($1,$3)',
    [row.id,a.pair.id,b.pair.id]
  );
  return row;
}
function injuryBody(winnerId,abandonedId){
  return {
    winnerPairId:Number(winnerId),
    abandonedPairId:Number(abandonedId),
    resultType:'injury_abandonment',
    playedAt:new Date().toISOString(),
    score:{sets:[{kind:'set',pairA:4,pairB:2}]},
  };
}
async function confirmInjury(a,submitter,winner,abandoned,confirmer){
  const first=await submitResult(submitter.id,a.id,injuryBody(winner.id,abandoned.id));
  assert.equal(first.status,'result_pending');
  const second=await confirmResult(confirmer.id,a.id);
  assert.equal(second.status,'confirmed');
  return second;
}

test('injury/abandonment stores abandoner, zero games, sporting streaks and ladder swap without extra penalty',async()=>{
  const top=await seedPair(5,1,{miss:1});
  const challenger=await seedPair(5,2,{miss:1});
  const a=await assignment(5,top,challenger);

  await confirmInjury(a,challenger.members[0],challenger.pair,top.pair,top.members[0]);

  const match=(await testPool.query('SELECT * FROM matches WHERE assignment_id=$1',[a.id])).rows[0];
  assert.equal(match.result_type,'injury_abandonment');
  assert.equal(Number(match.winner_pair_id),Number(challenger.pair.id));
  assert.equal(Number(match.abandoned_pair_id),Number(top.pair.id));
  assert.equal(match.score,null);
  assert.equal(Number(match.pair_a_games),0);
  assert.equal(Number(match.pair_b_games),0);

  const rows=(await testPool.query(
    'SELECT id,position,consecutive_wins,consecutive_losses,monthly_miss_streak,position_debt FROM pairs WHERE id=ANY($1::bigint[]) ORDER BY position',
    [[top.pair.id,challenger.pair.id]]
  )).rows;
  assert.equal(Number(rows[0].id),Number(challenger.pair.id));
  assert.equal(Number(rows[0].position),1);
  assert.equal(Number(rows[0].consecutive_wins),1);
  assert.equal(Number(rows[0].monthly_miss_streak),0);
  assert.equal(Number(rows[0].position_debt),0);
  assert.equal(Number(rows[1].id),Number(top.pair.id));
  assert.equal(Number(rows[1].position),2);
  assert.equal(Number(rows[1].consecutive_losses),1);
  assert.equal(Number(rows[1].monthly_miss_streak),0);
  assert.equal(Number(rows[1].position_debt),0);
});

test('injury/abandonment can trigger promotion after the third sporting win',async()=>{
  const leader=await seedPair(3,1,{wins:2});
  const rival=await seedPair(3,2);
  const a=await assignment(3,leader,rival);

  await confirmInjury(a,leader.members[0],leader.pair,rival.pair,rival.members[0]);

  const moved=(await testPool.query(
    `SELECT p.*,c.number category_number FROM pairs p JOIN categories c ON c.id=p.category_id WHERE p.id=$1`,
    [leader.pair.id]
  )).rows[0];
  assert.equal(Number(moved.category_number),2);
  assert.equal(Number(moved.position),1);
  assert.equal(Number(moved.consecutive_wins),0);
  assert.equal(Number((await testPool.query(
    "SELECT count(*) n FROM competitive_events WHERE pair_id=$1 AND event_type='promotion'",
    [leader.pair.id]
  )).rows[0].n),1);
  const match=(await testPool.query('SELECT category_number,pair_a_games,pair_b_games,abandoned_pair_id FROM matches WHERE assignment_id=$1',[a.id])).rows[0];
  assert.equal(Number(match.category_number),3);
  assert.equal(Number(match.pair_a_games)+Number(match.pair_b_games),0);
  assert.equal(Number(match.abandoned_pair_id),Number(rival.pair.id));
});

test('injury/abandonment can trigger adaptive relegation on the second loss at population gap five',async()=>{
  const current=[];
  for(let pos=1;pos<=7;pos++)current.push(await seedPair(3,pos,{losses:pos===7?1:0}));
  await seedPair(4,1);
  await seedPair(4,2);
  const winner=current[5],abandoned=current[6];
  const a=await assignment(3,winner,abandoned);

  await confirmInjury(a,winner.members[0],winner.pair,abandoned.pair,abandoned.members[0]);

  const moved=(await testPool.query(
    `SELECT p.*,c.number category_number FROM pairs p JOIN categories c ON c.id=p.category_id WHERE p.id=$1`,
    [abandoned.pair.id]
  )).rows[0];
  assert.equal(Number(moved.category_number),4);
  assert.equal(Number(moved.position),2);
  assert.equal(Number(moved.consecutive_losses),0);
  assert.equal(Number(moved.position_debt),0);
  assert.equal(Number((await testPool.query(
    "SELECT count(*) n FROM competitive_events WHERE pair_id=$1 AND event_type='relegation'",
    [abandoned.pair.id]
  )).rows[0].n),1);
});

test('injury/abandonment rejects declaring the winner as the abandoning pair',async()=>{
  const aPair=await seedPair(5,1);
  const bPair=await seedPair(5,2);
  const a=await assignment(5,aPair,bPair);
  await assert.rejects(
    ()=>submitResult(aPair.members[0].id,a.id,injuryBody(aPair.pair.id,aPair.pair.id)),
    /Pareja que abandonó inválida/
  );
  assert.equal(Number((await testPool.query('SELECT count(*) n FROM wheel_result_versions WHERE assignment_id=$1',[a.id])).rows[0].n),0);
});
