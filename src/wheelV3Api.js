import {pool,q} from './db.js';
import {problem} from './core.js';
import {currentPairForUser} from './pairs.js';
import {
  proposeWheelV3Schedule,
  acceptWheelV3Schedule,
  reportWheelV3NoShow,
  cancelWheelV3NoShow,
  contestWheelV3NoShow,
  acceptWheelV3NoShow,
  submitWheelV3ResultVersion,
  confirmWheelV3Result,
  applyWheelV3OneSidedFailure,
  runWheelV3Maintenance,
  wheelV3RecentMovements,
} from './wheelV3Engine.js';

async function tx(fn){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const result=await fn(client);
    await client.query('COMMIT');
    return result;
  }catch(error){
    await client.query('ROLLBACK');
    throw error;
  }finally{
    client.release();
  }
}

async function pairForUser(client,userId){
  const pair=await currentPairForUser(client,userId,{lock:true});
  if(!pair)throw problem('No tenés pareja vigente');
  return pair;
}

async function assignmentForPair(client,pairId,{lock=false}={}){
  return (await q(client,`
    SELECT wa.*
    FROM wheel_assignment_participants wap
    JOIN wheel_assignments wa ON wa.id=wap.assignment_id
    WHERE wap.pair_id=$1
    ${lock?'FOR UPDATE OF wa':''}
  `,[pairId])).rows[0]||null;
}

async function pairMembers(client,pairId,{phones=false}={}){
  return (await q(client,`
    SELECT u.id,u.first_name,u.last_name${phones?',u.phone':''}
    FROM pair_members pm
    JOIN users u ON u.id=pm.user_id
    WHERE pm.pair_id=$1
    ORDER BY u.id
  `,[pairId])).rows;
}

async function pairSummary(client,pairId,{phones=false}={}){
  const row=(await q(client,`
    SELECT
      p.id,p.league_id,p.category_id,p.position,p.competition_state,
      c.number category_number,l.slug league_slug,
      pws.role,pws.role_streak,pws.defense_required_until_real,
      pws.promotion_wins,pws.awaiting_zone_first_match,pws.awaiting_zone_kind,
      pws.real_waiting_since,pws.inactive_since,pws.return_position_base,
      pws.inactive_reason,pws.auto_reactivate_at
    FROM pairs p
    JOIN categories c ON c.id=p.category_id
    JOIN leagues l ON l.id=p.league_id
    JOIN pair_wheel_state pws ON pws.pair_id=p.id
    WHERE p.id=$1
  `,[pairId])).rows[0];
  if(!row)return null;
  row.members=await pairMembers(client,pairId,{phones});
  row.players=row.members.map(m=>`${m.first_name} ${m.last_name}`).join(' / ');
  return row;
}

async function decorateAssignment(client,assignment,myPairId=null){
  if(!assignment)return null;
  const pairIds=[Number(assignment.pair_a_id),Number(assignment.pair_b_id)];
  const rivalId=myPairId==null?null:pairIds.find(id=>id!==Number(myPairId));
  const result={...assignment};
  if(rivalId)result.rival=await pairSummary(client,rivalId,{phones:true});
  result.pendingProposal=(await q(client,`
    SELECT *
    FROM wheel_schedule_proposals
    WHERE assignment_id=$1 AND status='pending'
    ORDER BY id DESC
    LIMIT 1
  `,[assignment.id])).rows[0]||null;
  if(myPairId!=null){
    result.myVersion=(await q(client,`
      SELECT * FROM wheel_result_versions
      WHERE assignment_id=$1 AND pair_id=$2
    `,[assignment.id,myPairId])).rows[0]||null;
    result.otherVersion=(await q(client,`
      SELECT * FROM wheel_result_versions
      WHERE assignment_id=$1 AND pair_id<>$2
      ORDER BY updated_at DESC,id DESC
      LIMIT 1
    `,[assignment.id,myPairId])).rows[0]||null;
  }
  result.noShow=(await q(client,`
    SELECT *
    FROM wheel_no_shows
    WHERE assignment_id=$1
    ORDER BY id DESC
    LIMIT 1
  `,[assignment.id])).rows[0]||null;
  return result;
}

export async function myLeagueV3(userId){
  const client=await pool.connect();
  try{
    const user=(await q(client,`
      SELECT id,first_name,last_name,verification_status,discipline_state,
             identity_resubmit_reason,identity_resubmit_requested_at
      FROM users WHERE id=$1
    `,[userId])).rows[0];
    const pair=await currentPairForUser(client,userId);
    const serverNow=(await q(client,`SELECT CURRENT_TIMESTAMP server_now`)).rows[0].server_now;
    if(!pair)return {engine:'wheel-v3',user,pair:null,assignment:null,recentEvents:[],recentMovements:[],server_now:serverNow};
    const summary=await pairSummary(client,pair.id,{phones:true});
    const assignment=await decorateAssignment(client,await assignmentForPair(client,pair.id),pair.id);
    const recentMovements=await wheelV3RecentMovements(client,pair.id);
    return {engine:'wheel-v3',user,pair:summary,assignment,recentEvents:recentMovements,recentMovements,server_now:serverNow};
  }finally{client.release();}
}

export async function rankingV3(){
  return (await pool.query(`
    SELECT
      l.slug,
      c.number,
      p.id pair_id,
      p.position,
      p.competition_state,
      pws.role,
      string_agg(u.first_name||' '||u.last_name,' / ' ORDER BY u.id) players,
      (SELECT count(*) FROM matches m WHERE (m.pair_a_id=p.id OR m.pair_b_id=p.id) AND m.result_type IN('normal','injury_abandonment'))::int played,
      (SELECT count(*) FROM matches m WHERE m.winner_pair_id=p.id AND m.result_type IN('normal','injury_abandonment'))::int wins,
      (SELECT COALESCE(sum(CASE WHEN m.pair_a_id=p.id THEN m.pair_a_games-m.pair_b_games ELSE m.pair_b_games-m.pair_a_games END),0)
       FROM matches m
       WHERE (m.pair_a_id=p.id OR m.pair_b_id=p.id) AND m.result_type IN('normal','injury_abandonment'))::int game_diff
    FROM pairs p
    JOIN leagues l ON l.id=p.league_id
    JOIN categories c ON c.id=p.category_id
    JOIN pair_wheel_state pws ON pws.pair_id=p.id
    JOIN pair_members pm ON pm.pair_id=p.id
    JOIN users u ON u.id=pm.user_id
    WHERE p.competition_state<>'inactive'
    GROUP BY p.id,l.slug,c.number,pws.role
    ORDER BY l.slug,c.number,CASE WHEN p.competition_state='active' THEN 0 ELSE 1 END,p.position,p.id
  `)).rows;
}

export async function recordsV3(){
  const leagues=(await pool.query(`SELECT id,slug FROM leagues WHERE active=true ORDER BY id`)).rows;
  const out=[];
  for(const league of leagues){
    const max=Number((await pool.query(`
      SELECT COALESCE(max(defenses),0)::int max
      FROM first_place_reigns
      WHERE league_id=$1
    `,[league.id])).rows[0].max);
    const holders=max>0?(await pool.query(`
      SELECT
        fpr.id,fpr.pair_id,fpr.defenses,fpr.started_at,fpr.ended_at,
        (SELECT string_agg(u.first_name||' '||u.last_name,' / ' ORDER BY u.id)
         FROM pair_members pm JOIN users u ON u.id=pm.user_id
         WHERE pm.pair_id=fpr.pair_id) pair_name
      FROM first_place_reigns fpr
      WHERE fpr.league_id=$1 AND fpr.defenses=$2
      ORDER BY fpr.started_at,fpr.id
    `,[league.id,max])).rows:[];
    out.push({
      slug:league.slug,
      defenses:max,
      pair_name:holders[0]?.pair_name||null,
      achieved_at:holders[0]?.started_at||null,
      holders,
    });
  }
  return out;
}

export async function publicUpcomingV3(){
  return (await pool.query(`
    SELECT
      wa.id,wa.scheduled_at,l.slug,c.number category_number,wa.location_text,
      (SELECT string_agg(u.first_name||' '||u.last_name,' / ' ORDER BY u.id)
       FROM pair_members pm JOIN users u ON u.id=pm.user_id
       WHERE pm.pair_id=wa.pair_a_id) pair_a,
      (SELECT string_agg(u.first_name||' '||u.last_name,' / ' ORDER BY u.id)
       FROM pair_members pm JOIN users u ON u.id=pm.user_id
       WHERE pm.pair_id=wa.pair_b_id) pair_b
    FROM wheel_assignments wa
    JOIN leagues l ON l.id=wa.league_id
    JOIN categories c ON c.id=wa.category_id
    WHERE wa.status IN('open','result_pending','disputed')
      AND wa.schedule_confirmed_at IS NOT NULL
      AND wa.scheduled_at IS NOT NULL
    ORDER BY wa.scheduled_at,wa.id
    LIMIT 100
  `)).rows;
}

export async function recentResultsV3(){
  return (await pool.query(`
    SELECT
      m.id,m.played_at,m.result_type,m.score,m.pair_a_id,m.pair_b_id,m.winner_pair_id,
      l.slug,m.category_number,
      (SELECT string_agg(u.first_name||' '||u.last_name,' / ' ORDER BY u.id)
       FROM pair_members pm JOIN users u ON u.id=pm.user_id WHERE pm.pair_id=m.pair_a_id) pair_a,
      (SELECT string_agg(u.first_name||' '||u.last_name,' / ' ORDER BY u.id)
       FROM pair_members pm JOIN users u ON u.id=pm.user_id WHERE pm.pair_id=m.pair_b_id) pair_b
    FROM matches m
    JOIN leagues l ON l.id=m.league_id
    ORDER BY m.played_at DESC,m.id DESC
    LIMIT 50
  `)).rows;
}

export async function pairProfileV3(pairId){
  const pair=(await pool.query(`
    SELECT
      l.slug,c.number,p.id,p.position,p.competition_state,pws.role,
      string_agg(u.first_name||' '||u.last_name,' / ' ORDER BY u.id) players,
      (SELECT count(*) FROM matches m WHERE (m.pair_a_id=p.id OR m.pair_b_id=p.id) AND m.result_type IN('normal','injury_abandonment'))::int played,
      (SELECT count(*) FROM matches m WHERE m.winner_pair_id=p.id AND m.result_type IN('normal','injury_abandonment'))::int wins
    FROM pairs p
    JOIN leagues l ON l.id=p.league_id
    JOIN categories c ON c.id=p.category_id
    JOIN pair_wheel_state pws ON pws.pair_id=p.id
    JOIN pair_members pm ON pm.pair_id=p.id
    JOIN users u ON u.id=pm.user_id
    WHERE p.id=$1 AND p.competition_state<>'inactive'
    GROUP BY p.id,l.slug,c.number,pws.role
  `,[pairId])).rows[0];
  if(!pair)throw problem('Pareja inexistente',404);
  const matches=(await pool.query(`
    SELECT id,pair_a_id,pair_b_id,winner_pair_id,result_type,score,played_at
    FROM matches
    WHERE pair_a_id=$1 OR pair_b_id=$1
    ORDER BY played_at DESC,id DESC
    LIMIT 20
  `,[pairId])).rows;
  const events=await wheelV3RecentMovements(pool,pairId);
  const upcoming=(await pool.query(`
    SELECT wa.id,wa.scheduled_at,wa.location_text,c.number category_number,l.slug
    FROM wheel_assignment_participants wap
    JOIN wheel_assignments wa ON wa.id=wap.assignment_id
    JOIN categories c ON c.id=wa.category_id
    JOIN leagues l ON l.id=wa.league_id
    WHERE wap.pair_id=$1
      AND wa.schedule_confirmed_at IS NOT NULL
      AND wa.status IN('open','result_pending','disputed')
    LIMIT 1
  `,[pairId])).rows[0]||null;
  return {pair,matches,events,upcoming};
}

export async function proposeScheduleV3(userId,assignmentId,body){
  return tx(async client=>{
    const pair=await pairForUser(client,userId);
    return proposeWheelV3Schedule(client,{
      assignmentId,
      proposedByPairId:pair.id,
      scheduledAt:body.scheduledAt,
      locationText:body.locationText,
      venueId:body.venueId??null,
    });
  });
}

export async function acceptScheduleV3(userId,assignmentId,proposalId){
  return tx(async client=>{
    const pair=await pairForUser(client,userId);
    return acceptWheelV3Schedule(client,{assignmentId,proposalId,acceptingPairId:pair.id});
  });
}

export async function reportNoShowV3(userId,assignmentId){
  return tx(async client=>{
    const pair=await pairForUser(client,userId);
    return reportWheelV3NoShow(client,{assignmentId,reportedByPairId:pair.id});
  });
}

export async function cancelNoShowV3(userId,assignmentId){
  return tx(async client=>{
    const pair=await pairForUser(client,userId);
    return cancelWheelV3NoShow(client,{assignmentId,reportedByPairId:pair.id});
  });
}

export async function contestNoShowV3(userId,assignmentId){
  return tx(async client=>{
    const pair=await pairForUser(client,userId);
    return contestWheelV3NoShow(client,{assignmentId,reportedPairId:pair.id});
  });
}

export async function acceptNoShowV3(userId,assignmentId){
  return tx(async client=>{
    const pair=await pairForUser(client,userId);
    return acceptWheelV3NoShow(client,{assignmentId,reportedPairId:pair.id,reportedByUserId:userId});
  });
}

export async function submitResultV3(userId,assignmentId,body){
  return tx(async client=>{
    const pair=await pairForUser(client,userId);
    return submitWheelV3ResultVersion(client,{
      assignmentId,
      pairId:pair.id,
      winnerPairId:Number(body.winnerPairId),
      resultType:body.resultType||'normal',
      playedAt:body.playedAt,
      score:body.score??null,
      abandonedPairId:body.abandonedPairId??null,
    });
  });
}

export async function confirmResultV3(userId,assignmentId){
  return tx(async client=>{
    const pair=await pairForUser(client,userId);
    return confirmWheelV3Result(client,{assignmentId,confirmingPairId:pair.id});
  });
}

export async function reportOwnFailureV3(userId,assignmentId){
  return tx(async client=>{
    const pair=await pairForUser(client,userId);
    return applyWheelV3OneSidedFailure(client,{
      assignmentId,
      failingPairId:pair.id,
      reportedByUserId:userId,
      resolutionSource:'self_failure',
    });
  });
}

export async function maintenanceV3(){
  return tx(async client=>{
    await q(client,`SELECT pg_advisory_xact_lock(8675310)`);
    return runWheelV3Maintenance(client);
  });
}
