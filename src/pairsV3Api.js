import {pool,q} from './db.js';
import {problem} from './core.js';
import {queueUserNotification,queuePairNotification} from './notifications.js';
import {availablePartners,currentPairForUser} from './pairs.js';
import {
  resolveWheelV3FormationCategory,
  formWheelV3Pair,
  requestWheelV3Inactivity,
  reactivateWheelV3Pair,
  archiveWheelV3Pair,
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

async function memberRows(client,pairId){
  return (await q(client,`
    SELECT u.id,u.first_name,u.last_name,u.phone,u.current_category_number,u.discipline_state
    FROM pair_members pm
    JOIN users u ON u.id=pm.user_id
    WHERE pm.pair_id=$1
    ORDER BY u.id
  `,[pairId])).rows;
}

export async function pairHubV3(userId){
  const client=await pool.connect();
  try{
    const user=(await q(client,`
      SELECT id,first_name,last_name,gender,verification_status,current_category_number,discipline_state
      FROM users WHERE id=$1
    `,[userId])).rows[0];
    const pair=await currentPairForUser(client,userId);
    let cleanPair=null;
    if(pair){
      cleanPair=(await q(client,`
        SELECT p.id,p.league_id,p.category_id,p.position,p.competition_state,p.pause_after_current,
               c.number category_number,l.slug league_slug,
               pws.role,pws.role_streak,pws.defense_required_until_real,pws.promotion_wins,
               pws.awaiting_zone_first_match,pws.awaiting_zone_kind,pws.real_waiting_since,
               pws.inactive_since,pws.return_position_base,pws.inactive_reason,pws.auto_reactivate_at
        FROM pairs p
        JOIN categories c ON c.id=p.category_id
        JOIN leagues l ON l.id=p.league_id
        JOIN pair_wheel_state pws ON pws.pair_id=p.id
        WHERE p.id=$1
      `,[pair.id])).rows[0];
      cleanPair.members=await memberRows(client,pair.id);
    }
    const incoming=(await q(client,`
      SELECT pi.*,u.first_name,u.last_name
      FROM pair_invitations pi
      JOIN users u ON u.id=pi.inviter_user_id
      WHERE pi.invitee_user_id=$1 AND pi.status='pending' AND pi.expires_at>CURRENT_TIMESTAMP
      ORDER BY pi.created_at DESC
    `,[userId])).rows;
    const outgoing=(await q(client,`
      SELECT pi.*,u.first_name,u.last_name
      FROM pair_invitations pi
      JOIN users u ON u.id=pi.invitee_user_id
      WHERE pi.inviter_user_id=$1 AND pi.status='pending' AND pi.expires_at>CURRENT_TIMESTAMP
      ORDER BY pi.created_at DESC
    `,[userId])).rows;
    const hasOpenAssignment=pair?Boolean((await q(client,`SELECT 1 FROM wheel_assignment_participants WHERE pair_id=$1`,[pair.id])).rowCount):false;
    const pauseRequest=pair?(await q(client,`
      SELECT * FROM pair_pause_requests WHERE pair_id=$1 AND status='pending' ORDER BY id DESC LIMIT 1
    `,[pair.id])).rows[0]||null:null;
    const dissolutionRequest=pair?(await q(client,`
      SELECT * FROM pair_dissolution_requests
      WHERE pair_id=$1 AND status IN('pending','confirmed','awaiting_result')
      ORDER BY id DESC LIMIT 1
    `,[pair.id])).rows[0]||null:null;
    return {
      engine:'wheel-v3',
      user,
      pair:cleanPair,
      incoming,
      outgoing,
      available:pair?[]:await availablePartners(userId),
      hasOpenAssignment,
      pauseRequest,
      dissolutionRequest,
    };
  }finally{client.release();}
}

export async function invitePartnerV3(userId,inviteeId,requestedCategoryNumber){
  return tx(async client=>{
    const userIds=[Number(userId),Number(inviteeId)];
    const users=(await q(client,`
      SELECT id,gender,verification_status,discipline_state
      FROM users
      WHERE id=ANY($1::bigint[])
      ORDER BY id
      FOR UPDATE
    `,[userIds])).rows;
    if(users.length!==2)throw problem('Jugador inválido');
    if(users[0].gender!==users[1].gender)throw problem('La pareja debe pertenecer al mismo circuito');
    if(users.some(u=>u.verification_status!=='verified'))throw problem('Ambos jugadores deben estar verificados');
    if(users.some(u=>u.discipline_state!=='clear'))throw problem('Hay una revisión disciplinaria abierta');
    if((await q(client,`SELECT 1 FROM active_pair_memberships WHERE user_id=ANY($1::bigint[])`,[userIds])).rowCount)throw problem('Uno de los jugadores ya integra una pareja vigente');

    await q(client,`
      UPDATE pair_invitations
      SET status='expired',responded_at=CURRENT_TIMESTAMP
      WHERE status='pending' AND expires_at<=CURRENT_TIMESTAMP
    `);
    if((await q(client,`SELECT 1 FROM pair_invitations WHERE inviter_user_id=$1 AND status='pending'`,[userId])).rowCount)throw problem('Ya tenés una invitación saliente activa');

    const resolved=await resolveWheelV3FormationCategory(client,{userIds,requestedCategoryNumber});
    const inv=(await q(client,`
      INSERT INTO pair_invitations(
        inviter_user_id,invitee_user_id,requested_category_number,resulting_category_number
      )
      VALUES($1,$2,$3,$4)
      RETURNING *
    `,[userId,inviteeId,requestedCategoryNumber??null,resolved.categoryNumber])).rows[0];

    await queueUserNotification(client,{
      userId:inviteeId,
      type:'pair_invitation',
      title:'Invitación de pareja',
      body:`Te invitaron a formar una pareja que competiría en ${resolved.categoryNumber}ª.`,
      payload:{invitationId:inv.id},
      dedupeKey:`v3-pair-invite:${inv.id}`,
    });
    return inv;
  });
}

export async function cancelInvitationV3(userId,id){
  const row=(await pool.query(`
    UPDATE pair_invitations
    SET status='cancelled',responded_at=CURRENT_TIMESTAMP
    WHERE id=$1 AND inviter_user_id=$2 AND status='pending'
    RETURNING *
  `,[id,userId])).rows[0];
  if(!row)throw problem('Invitación no disponible',404);
  return row;
}

export async function acceptInvitationV3(userId,id){
  return tx(async client=>{
    const inv=(await q(client,`
      SELECT *
      FROM pair_invitations
      WHERE id=$1 AND invitee_user_id=$2 AND status='pending' AND expires_at>CURRENT_TIMESTAMP
      FOR UPDATE
    `,[id,userId])).rows[0];
    if(!inv)throw problem('Invitación vencida o inexistente');

    const userIds=[Number(inv.inviter_user_id),Number(inv.invitee_user_id)];
    const formed=await formWheelV3Pair(client,{
      userIds,
      requestedCategoryNumber:inv.requested_category_number??inv.resulting_category_number,
    });
    await q(client,`
      UPDATE pair_invitations SET status='accepted',responded_at=CURRENT_TIMESTAMP WHERE id=$1
    `,[inv.id]);
    await q(client,`
      UPDATE pair_invitations
      SET status='invalidated',responded_at=CURRENT_TIMESTAMP
      WHERE status='pending' AND id<>$2
        AND (inviter_user_id=ANY($1::bigint[]) OR invitee_user_id=ANY($1::bigint[]))
    `,[userIds,inv.id]);
    return formed;
  });
}

export async function requestPauseV3(userId){
  return tx(async client=>{
    const pair=await currentPairForUser(client,userId,{lock:true});
    if(!pair)throw problem('No tenés pareja vigente');
    return requestWheelV3Inactivity(client,{pairId:pair.id,requestedByUserId:userId});
  });
}

export async function reactivatePairV3(userId){
  return tx(async client=>{
    const pair=await currentPairForUser(client,userId,{lock:true});
    if(!pair||pair.competition_state!=='paused')throw problem('La pareja no está inactiva');
    return reactivateWheelV3Pair(client,pair.id);
  });
}

export async function requestDissolutionV3(userId){
  return tx(async client=>{
    const pair=await currentPairForUser(client,userId,{lock:true});
    if(!pair)throw problem('No tenés pareja vigente');
    if(pair.discipline_state!=='clear')throw problem('La pareja debe resolver su disciplina antes de disolverse');
    const members=await memberRows(client,pair.id);
    if(members.some(m=>m.discipline_state!=='clear'))throw problem('Hay disciplina individual pendiente');

    let request=(await q(client,`
      SELECT *
      FROM pair_dissolution_requests
      WHERE pair_id=$1 AND status IN('pending','confirmed','awaiting_result')
      FOR UPDATE
    `,[pair.id])).rows[0];

    if(!request){
      request=(await q(client,`
        INSERT INTO pair_dissolution_requests(pair_id,requested_by_user_id)
        VALUES($1,$2)
        RETURNING *
      `,[pair.id,userId])).rows[0];
    }else if(Number(request.requested_by_user_id)!==Number(userId)&&request.status==='pending'){
      const occupied=(await q(client,`SELECT assignment_id FROM wheel_assignment_participants WHERE pair_id=$1`,[pair.id])).rows[0];
      if(occupied){
        request=(await q(client,`
          UPDATE pair_dissolution_requests
          SET status='awaiting_result'
          WHERE id=$1
          RETURNING *
        `,[request.id])).rows[0];
      }else{
        request=(await q(client,`
          UPDATE pair_dissolution_requests
          SET status='applied',resolved_at=CURRENT_TIMESTAMP
          WHERE id=$1
          RETURNING *
        `,[request.id])).rows[0];
        await archiveWheelV3Pair(client,pair.id);
      }
    }

    await queuePairNotification(client,pair.id,{
      type:'dissolution_request',
      title:'Solicitud de disolución',
      body:request.status==='awaiting_result'
        ?'La disolución quedó confirmada y se aplicará cuando se resuelva el compromiso abierto.'
        :'Hay una solicitud de disolución de pareja.',
      payload:{pairId:pair.id,status:request.status},
      dedupeKey:`v3-dissolve:${request.id}:${request.status}`,
    });
    return request;
  });
}
