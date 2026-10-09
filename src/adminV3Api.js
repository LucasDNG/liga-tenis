import {pool,q} from './db.js';
import {whatsappConfiguration} from './config.js';
import {problem} from './core.js';
import {
  resolveWheelV3ResultDispute,
  dismissWheelV3NoShowByAdmin,
  resolveWheelV3NoShowByAdmin,
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
  }finally{client.release();}
}

export async function disputesV3(){
  const rows=(await pool.query(`
    SELECT wa.*,
      (SELECT string_agg(u.first_name||' '||u.last_name,' / ' ORDER BY u.id)
       FROM pair_members pm JOIN users u ON u.id=pm.user_id WHERE pm.pair_id=wa.pair_a_id) pair_a_name,
      (SELECT string_agg(u.first_name||' '||u.last_name,' / ' ORDER BY u.id)
       FROM pair_members pm JOIN users u ON u.id=pm.user_id WHERE pm.pair_id=wa.pair_b_id) pair_b_name
    FROM wheel_assignments wa
    WHERE wa.status='disputed'
    ORDER BY wa.assigned_at,wa.id
  `)).rows;
  for(const row of rows){
    row.versions=(await pool.query(`
      SELECT *
      FROM wheel_result_versions
      WHERE assignment_id=$1
      ORDER BY id
    `,[row.id])).rows;
    row.noShow=(await pool.query(`
      SELECT *
      FROM wheel_no_shows
      WHERE assignment_id=$1
        AND status IN('contested','admin_review')
      ORDER BY id DESC
      LIMIT 1
    `,[row.id])).rows[0]||null;
  }
  return rows;
}

export async function resolveDisputeV3(adminId,assignmentId,{action,versionId=null,failingPairId=null}={}){
  return tx(async client=>{
    if(action==='select'){
      if(versionId==null)throw problem('Elegí una versión de resultado');
      return resolveWheelV3ResultDispute(client,{
        assignmentId,
        versionId,
        adminUserId:adminId,
      });
    }
    if(action==='no_show_dismiss'){
      return dismissWheelV3NoShowByAdmin(client,{
        assignmentId,
        adminUserId:adminId,
      });
    }
    if(action==='no_show_fail'){
      if(failingPairId==null)throw problem('Indicá la pareja incumplidora');
      return resolveWheelV3NoShowByAdmin(client,{
        assignmentId,
        failingPairId,
        adminUserId:adminId,
      });
    }
    throw problem('Acción administrativa inválida');
  });
}

export async function systemStatusV3(){
  const [outbox,open,disputes,pending,discipline,players,pairs,clock,formation,server]=await Promise.all([
    pool.query(`SELECT status,count(*)::int n FROM notification_outbox GROUP BY status`),
    pool.query(`SELECT count(*)::int n FROM wheel_assignments WHERE status IN('open','result_pending','disputed')`),
    pool.query(`SELECT count(*)::int n FROM wheel_assignments WHERE status='disputed'`),
    pool.query(`SELECT count(*)::int n FROM users WHERE verification_status='pending'`),
    pool.query(`SELECT count(*)::int n FROM discipline_reports WHERE status IN('open','reviewed')`),
    pool.query(`SELECT count(*)::int n FROM users WHERE role='player'`),
    pool.query(`SELECT count(*)::int n FROM pairs WHERE competition_state='active'`),
    pool.query(`SELECT value FROM app_settings WHERE key='league_clock_paused'`),
    pool.query(`
      SELECT l.id,l.slug,l.name,lws.formation_completed_at
      FROM leagues l
      LEFT JOIN league_wheel_state lws ON lws.league_id=l.id
      WHERE l.active=true
      ORDER BY l.id
    `),
    pool.query(`SELECT CURRENT_TIMESTAMP server_now`),
  ]);
  const outboxMap=Object.fromEntries(outbox.rows.map(r=>[r.status,Number(r.n)]));
  return {
    engine:'wheel-v3',
    whatsapp:whatsappConfiguration().configured,
    whatsappConfiguration:whatsappConfiguration(),
    outbox:outbox.rows,
    outboxPending:outboxMap.pending||0,
    outboxFailed:outboxMap.failed||0,
    openAssignments:Number(open.rows[0].n),
    disputes:Number(disputes.rows[0].n),
    pendingIdentity:Number(pending.rows[0].n),
    discipline:Number(discipline.rows[0].n),
    players:Number(players.rows[0].n),
    activePairs:Number(pairs.rows[0].n),
    clockPaused:clock.rows[0]?.value===true,
    formation:formation.rows,
    server_now:server.rows[0].server_now,
  };
}
