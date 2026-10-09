import {pool,q} from './db.js';
import {problem} from './core.js';
import {currentPairForUser} from './pairs.js';
import {event} from './competitionEngine.js';
import {queueAssignmentNotification} from './notifications.js';
async function cancelUnplayedForPair(client,pairId,reason){
  const a=(await q(client,`SELECT wa.* FROM wheel_assignment_participants wap JOIN wheel_assignments wa ON wa.id=wap.assignment_id WHERE wap.pair_id=$1 FOR UPDATE OF wa`,[pairId])).rows[0];
  if(!a||a.status!=='open')return;
  const versions=Number((await q(client,`SELECT count(*) n FROM wheel_result_versions WHERE assignment_id=$1`,[a.id])).rows[0].n);if(versions)return;
  await q(client,`UPDATE wheel_assignments SET status='cancelled',closed_at=now(),close_reason=$2 WHERE id=$1`,[a.id,reason]);
  await q(client,`DELETE FROM wheel_assignment_participants WHERE assignment_id=$1`,[a.id]);
  const rival=Number(a.pair_a_id)===Number(pairId)?a.pair_b_id:a.pair_a_id;
  await q(client,`UPDATE pairs SET waiting_since=now() WHERE id=$1 AND competition_state='active'`,[rival]);
  await queueAssignmentNotification(client,a,{type:'discipline_assignment_closed',title:'Partido cerrado',body:'El compromiso se cerró de forma neutral por una revisión disciplinaria. No genera resultado deportivo ni sanción de coordinación.',payload:{assignmentId:a.id},dedupeKey:`discipline-close:${a.id}`});
}
async function recalcPair(client,pairId){
  const p=(await q(client,`SELECT discipline_resolved_at,discipline_state FROM pairs WHERE id=$1 FOR UPDATE`,[pairId])).rows[0];if(!p)return;
  const stats=(await q(client,`SELECT count(DISTINCT reporter_pair_id)::int reporters,count(*) FILTER(WHERE reason IN('violence','threats'))::int serious FROM discipline_reports WHERE reported_pair_id=$1 AND status IN('open','reviewed') AND created_at>=now()-interval '180 days' AND created_at>COALESCE($2::timestamptz,'epoch')`,[pairId,p.discipline_resolved_at])).rows[0];
  const next=Number(stats.serious)>0||Number(stats.reporters)>=5?'review':Number(stats.reporters)>=3?'observed':'clear';
  await q(client,`UPDATE pairs SET discipline_state=$2 WHERE id=$1`,[pairId,next]);
  if(next!=='clear'&&p.discipline_state==='clear')await cancelUnplayedForPair(client,pairId,'pair_discipline');
}
async function recalcUser(client,userId){
  const u=(await q(client,`SELECT discipline_resolved_at,discipline_state FROM users WHERE id=$1 FOR UPDATE`,[userId])).rows[0];if(!u)return;
  const stats=(await q(client,`SELECT count(DISTINCT reporter_pair_id)::int reporters,count(*) FILTER(WHERE reason IN('violence','threats'))::int serious FROM discipline_reports WHERE reported_user_id=$1 AND status IN('open','reviewed') AND created_at>=now()-interval '180 days' AND created_at>COALESCE($2::timestamptz,'epoch')`,[userId,u.discipline_resolved_at])).rows[0];
  const next=Number(stats.serious)>0||Number(stats.reporters)>=5?'review':Number(stats.reporters)>=3?'observed':'clear';
  await q(client,`UPDATE users SET discipline_state=$2 WHERE id=$1`,[userId,next]);
  if(next!=='clear'&&u.discipline_state==='clear'){
    const membership=(await q(client,`SELECT pair_id FROM active_pair_memberships WHERE user_id=$1`,[userId])).rows[0];
    if(membership)await cancelUnplayedForPair(client,membership.pair_id,'player_discipline');
  }
}
export async function reportDiscipline(userId,{assignmentId,targetPairId=null,targetUserId=null,reason,details=null}){if(!['misconduct','violence','threats','coordination_refusal','no_show','other'].includes(reason))throw problem('Motivo inválido');if(reason==='other'&&!String(details||'').trim())throw problem('Explicá el motivo');const client=await pool.connect();try{await client.query('BEGIN');const reporter=await currentPairForUser(client,userId);if(!reporter)throw problem('Necesitás una pareja vigente');const a=(await q(client,`SELECT * FROM wheel_assignments WHERE id=$1`,[assignmentId])).rows[0];if(!a||![Number(a.pair_a_id),Number(a.pair_b_id)].includes(Number(reporter.id)))throw problem('El reporte debe corresponder a un partido propio');if(a.closed_at&&new Date(a.closed_at).getTime()<Date.now()-15*24*60*60*1000)throw problem('El plazo para reportar este hecho venció');const rival=Number(a.pair_a_id)===Number(reporter.id)?Number(a.pair_b_id):Number(a.pair_a_id);if(targetUserId){if(!(await q(client,`SELECT 1 FROM pair_members WHERE pair_id=$1 AND user_id=$2`,[rival,targetUserId])).rowCount)throw problem('Jugador reportado inválido');}else{targetPairId=rival;}
 const r=(await q(client,`INSERT INTO discipline_reports(assignment_id,reporter_pair_id,reported_pair_id,reported_user_id,reason,details) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[a.id,reporter.id,targetPairId||null,targetUserId||null,reason,details||null])).rows[0];if(targetUserId)await recalcUser(client,targetUserId);else await recalcPair(client,targetPairId);await event(client,`discipline-report:${r.id}`,'discipline_report',{pairId:reporter.id,userId,assignmentId:a.id,data:{reportId:r.id,reason}});await client.query('COMMIT');return r;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
export async function recalcTarget(client,report){if(report.reported_user_id)return recalcUser(client,report.reported_user_id);return recalcPair(client,report.reported_pair_id);}
