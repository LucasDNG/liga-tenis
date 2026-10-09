import crypto from 'crypto';
import {pool} from './db.js';
import {whatsappConfiguration} from './config.js';
import {problem} from './core.js';
import {recalcTarget} from './discipline.js';
import {applySportingResult} from './competitionEngine.js';
import {dispatchWhatsAppOutbox,queueUserNotification,queueAssignmentNotification} from './notifications.js';
import {closeAssignment} from './wheel.js';

export async function pendingUsers(){return (await pool.query(`SELECT u.id,u.first_name,u.last_name,u.dni,u.phone,u.gender,u.verification_status,u.identity_resubmit_reason,u.identity_resubmit_requested_at,u.created_at,d.submitted_at,(d.front_data IS NOT NULL AND d.back_data IS NOT NULL) AS documents_available FROM users u LEFT JOIN identity_documents d ON d.user_id=u.id WHERE u.verification_status='pending' ORDER BY u.created_at,u.id`)).rows;}
export async function searchUsers(term){const q=String(term||'').trim();if(q.length<2)return [];const digits=q.replace(/\D/g,'');return (await pool.query(`SELECT id,first_name,last_name,dni,phone,gender,verification_status,current_category_number,created_at FROM users WHERE ($1<>'' AND dni LIKE $1||'%') OR lower(first_name||' '||last_name) LIKE '%'||lower($2)||'%' ORDER BY last_name,first_name LIMIT 25`,[digits,q])).rows;}
export async function setUserVerification(adminId,userId,status){
  if(!['verified','rejected'].includes(status))throw problem('Estado inválido');
  const client=await pool.connect();
  try{
    await client.query('BEGIN');

    const current=(await client.query(`
      SELECT id,verification_status
      FROM users
      WHERE id=$1
      FOR UPDATE
    `,[userId])).rows[0];

    if(!current)throw problem('Jugador inexistente',404);
    if(current.verification_status!=='pending')throw problem('La identidad ya no está pendiente',409);

    if(status==='verified'){
      const docs=(await client.query(`
        SELECT user_id
        FROM identity_documents
        WHERE user_id=$1
          AND front_data IS NOT NULL
          AND back_data IS NOT NULL
        FOR UPDATE
      `,[userId])).rows[0];
      if(!docs)throw problem('No están disponibles el frente y dorso del DNI',409);
    }

    const isVerified=status==='verified';
    const u=(await client.query(`
      UPDATE users
      SET verification_status=$2::varchar(20),
          verified_at=CASE WHEN $3::boolean THEN now() ELSE verified_at END,
          identity_resubmit_reason=NULL,
          identity_resubmit_requested_at=NULL,
          updated_at=now()
      WHERE id=$1
      RETURNING id,first_name,last_name,verification_status,verified_at
    `,[userId,status,isVerified])).rows[0];

    await client.query(`DELETE FROM identity_documents WHERE user_id=$1`,[userId]);

    await client.query(`
      INSERT INTO admin_audit_events(admin_user_id,action,target_type,target_id,data)
      VALUES($1,'identity_verification','user',$2,$3::jsonb)
    `,[adminId,userId,JSON.stringify({status,documentsPurged:true})]);

    await client.query('COMMIT');
    return u;
  }catch(e){
    await client.query('ROLLBACK');
    throw e;
  }finally{
    client.release();
  }
}
export async function identityDocument(userId,side){if(!['front','back'].includes(side))throw problem('Lado de DNI inválido');const prefix=side==='front'?'front':'back';const r=(await pool.query(`SELECT ${prefix}_mime AS mime,${prefix}_data AS data FROM identity_documents WHERE user_id=$1`,[userId])).rows[0];if(!r||!r.data)throw problem('El documento no está disponible',404);return r;}

export async function requestIdentityResubmission(adminId,userId,reason){
  const cleanReason=String(reason||'').trim();
  if(!cleanReason)throw problem('Indicá el motivo para pedir nuevas fotos');
  if(cleanReason.length>500)throw problem('El motivo es demasiado largo');

  const client=await pool.connect();
  try{
    await client.query('BEGIN');

    const u=(await client.query(`
      SELECT id,first_name,last_name,verification_status
      FROM users
      WHERE id=$1
      FOR UPDATE
    `,[userId])).rows[0];

    if(!u)throw problem('Jugador inexistente',404);
    if(u.verification_status!=='pending')throw problem('La identidad ya no está pendiente de verificación',409);

    // Las fotos anteriores dejan de estar disponibles inmediatamente.
    await client.query(`DELETE FROM identity_documents WHERE user_id=$1`,[userId]);

    const updated=(await client.query(`
      UPDATE users
      SET identity_resubmit_reason=$2,
          identity_resubmit_requested_at=now(),
          updated_at=now()
      WHERE id=$1
      RETURNING identity_resubmit_requested_at
    `,[userId,cleanReason])).rows[0];

    await queueUserNotification(client,{
      userId,
      type:'identity_resubmit',
      title:'Necesitamos nuevas fotos de tu DNI',
      body:`Administración pidió que vuelvas a enviar frente y dorso. Motivo: ${cleanReason}`,
      payload:{reason:cleanReason},
      dedupeKey:`identity-resubmit:${userId}:${new Date(updated.identity_resubmit_requested_at).toISOString()}`,
    });

    await client.query(`
      INSERT INTO admin_audit_events(admin_user_id,action,target_type,target_id,data)
      VALUES($1,'identity_resubmit_request','user',$2,$3::jsonb)
    `,[adminId,userId,JSON.stringify({reason:cleanReason,documentsPurged:true})]);

    await client.query('COMMIT');
    return {ok:true,reason:cleanReason,requestedAt:updated.identity_resubmit_requested_at};
  }catch(e){
    await client.query('ROLLBACK');
    throw e;
  }finally{
    client.release();
  }
}

export async function updateUserDni(adminId,userId,dni){const clean=String(dni||'').replace(/\D/g,'');if(clean.length<7||clean.length>9)throw problem('DNI inválido');const client=await pool.connect();try{await client.query('BEGIN');const before=(await client.query(`SELECT dni FROM users WHERE id=$1 FOR UPDATE`,[userId])).rows[0];if(!before)throw problem('Jugador inexistente',404);const u=(await client.query(`UPDATE users SET dni=$2,updated_at=now() WHERE id=$1 RETURNING id,first_name,last_name,dni,phone,verification_status`,[userId,clean])).rows[0];await client.query(`INSERT INTO admin_audit_events(admin_user_id,action,target_type,target_id,data) VALUES($1,'identity_dni_correct','user',$2,$3::jsonb)`,[adminId,userId,JSON.stringify({before:before.dni,after:clean})]);await client.query('COMMIT');return u;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
export async function listVenues(){return (await pool.query(`SELECT * FROM venues ORDER BY active DESC,sort_order,name`)).rows;}
export async function createVenue(adminId,b){const r=(await pool.query(`INSERT INTO venues(name,address,active,associated,booking_enabled,booking_url,instagram,sort_order) VALUES($1,$2,COALESCE($3,true),COALESCE($4,false),COALESCE($5,false),$6,$7,COALESCE($8,100)) RETURNING *`,[b.name,b.address||null,b.active,b.associated,b.bookingEnabled,b.bookingUrl||null,b.instagram||null,b.sortOrder])).rows[0];await pool.query(`INSERT INTO admin_audit_events(admin_user_id,action,target_type,target_id,data) VALUES($1,'venue_create','venue',$2,$3::jsonb)`,[adminId,r.id,JSON.stringify(r)]);return r;}
export async function updateVenue(adminId,id,b){const r=(await pool.query(`UPDATE venues SET name=COALESCE($2,name),address=COALESCE($3,address),active=COALESCE($4,active),associated=COALESCE($5,associated),booking_enabled=COALESCE($6,booking_enabled),booking_url=COALESCE($7,booking_url),instagram=COALESCE($8,instagram),sort_order=COALESCE($9,sort_order),updated_at=now() WHERE id=$1 RETURNING *`,[id,b.name??null,b.address??null,b.active??null,b.associated??null,b.bookingEnabled??null,b.bookingUrl??null,b.instagram??null,b.sortOrder??null])).rows[0];if(!r)throw problem('Lugar inexistente',404);await pool.query(`INSERT INTO admin_audit_events(admin_user_id,action,target_type,target_id,data) VALUES($1,'venue_update','venue',$2,$3::jsonb)`,[adminId,id,JSON.stringify(b)]);return r;}
export async function disputes(){return (await pool.query(`SELECT wa.*,json_agg(wrv ORDER BY wrv.id) versions FROM wheel_assignments wa JOIN wheel_result_versions wrv ON wrv.assignment_id=wa.id WHERE wa.status='disputed' GROUP BY wa.id ORDER BY wa.assigned_at`)).rows;}
export async function resolveDispute(adminId,assignmentId,{action,versionId=null}){const client=await pool.connect();try{await client.query('BEGIN');const a=(await client.query(`SELECT * FROM wheel_assignments WHERE id=$1 AND status='disputed' FOR UPDATE`,[assignmentId])).rows[0];if(!a)throw problem('Disputa inexistente');if(action==='void'){await closeAssignment(client,a,'void','admin_void');await queueAssignmentNotification(client,a,{type:'result_void',title:'Disputa resuelta',body:'Administración cerró la disputa sin declarar un resultado deportivo.',payload:{assignmentId:a.id},dedupeKey:`dispute-resolved:${a.id}:void`});}else if(action==='select'){const v=(await client.query(`SELECT * FROM wheel_result_versions WHERE id=$1 AND assignment_id=$2`,[versionId,a.id])).rows[0];if(!v)throw problem('Versión inválida');await applySportingResult(client,{assignment:a,winnerPairId:v.winner_pair_id,resultType:v.result_type,score:v.score,abandonedPairId:v.abandoned_pair_id,playedAt:v.played_at,source:'admin_dispute'});await closeAssignment(client,a,'confirmed','admin_dispute');await queueAssignmentNotification(client,a,{type:'result_confirmed',title:'Disputa resuelta',body:'Administración resolvió la disputa y el resultado ya es oficial.',payload:{assignmentId:a.id},dedupeKey:`dispute-resolved:${a.id}:select`});}else throw problem('Acción inválida');await client.query(`INSERT INTO admin_audit_events(admin_user_id,action,target_type,target_id,data) VALUES($1,'dispute_resolve','assignment',$2,$3::jsonb)`,[adminId,a.id,JSON.stringify({action,versionId})]);await client.query('COMMIT');return {ok:true};}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
export async function disciplineQueue(){return (await pool.query(`SELECT dr.*,rp.id reporter_pair_id,string_agg(DISTINCT ru.first_name||' '||ru.last_name,' / ') reporter_players FROM discipline_reports dr JOIN pairs rp ON rp.id=dr.reporter_pair_id JOIN pair_members rpm ON rpm.pair_id=rp.id JOIN users ru ON ru.id=rpm.user_id WHERE dr.status IN('open','reviewed') GROUP BY dr.id,rp.id ORDER BY dr.created_at`)).rows;}
export async function resolveDiscipline(adminId,reportId,status){if(!['reviewed','dismissed','resolved'].includes(status))throw problem('Estado inválido');const client=await pool.connect();try{await client.query('BEGIN');const r=(await client.query(`UPDATE discipline_reports SET status=$2,resolved_at=CASE WHEN $2 IN('dismissed','resolved') THEN now() ELSE resolved_at END,resolved_by_user_id=$3 WHERE id=$1 RETURNING *`,[reportId,status,adminId])).rows[0];if(!r)throw problem('Reporte inexistente');if(status==='resolved'){
      if(r.reported_pair_id){await client.query(`UPDATE discipline_reports SET status='resolved',resolved_at=now(),resolved_by_user_id=$2 WHERE reported_pair_id=$1 AND status IN('open','reviewed')`,[r.reported_pair_id,adminId]);await client.query(`UPDATE pairs SET discipline_state='clear',discipline_resolved_at=now() WHERE id=$1`,[r.reported_pair_id]);}
      if(r.reported_user_id){await client.query(`UPDATE discipline_reports SET status='resolved',resolved_at=now(),resolved_by_user_id=$2 WHERE reported_user_id=$1 AND status IN('open','reviewed')`,[r.reported_user_id,adminId]);await client.query(`UPDATE users SET discipline_state='clear',discipline_resolved_at=now() WHERE id=$1`,[r.reported_user_id]);}
    }else await recalcTarget(client,r);await client.query(`INSERT INTO admin_audit_events(admin_user_id,action,target_type,target_id,data) VALUES($1,'discipline_report','report',$2,$3::jsonb)`,[adminId,r.id,JSON.stringify({status})]);await client.query('COMMIT');return r;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
export async function systemStatus(){
  const [outbox,open,disputesCount,pending,discipline,players,pairs,clock]=await Promise.all([
    pool.query(`SELECT status,count(*)::int n FROM notification_outbox GROUP BY status`),
    pool.query(`SELECT count(*)::int n FROM wheel_assignments WHERE status IN('open','result_pending','disputed')`),
    pool.query(`SELECT count(*)::int n FROM wheel_assignments WHERE status='disputed'`),
    pool.query(`SELECT count(*)::int n FROM users WHERE verification_status='pending'`),
    pool.query(`SELECT count(*)::int n FROM discipline_reports WHERE status IN('open','reviewed')`),
    pool.query(`SELECT count(*)::int n FROM users WHERE role='player'`),
    pool.query(`SELECT count(*)::int n FROM pairs WHERE competition_state<>'inactive'`),
    pool.query(`SELECT value FROM app_settings WHERE key='league_clock_paused'`)
  ]);
  const outboxMap=Object.fromEntries(outbox.rows.map(r=>[r.status,Number(r.n)]));
  return {
    engine:'wheel-v2',
    whatsapp:whatsappConfiguration().configured,
    whatsappConfiguration:whatsappConfiguration(),
    outbox:outbox.rows,
    outboxPending:outboxMap.pending||0,
    outboxFailed:outboxMap.failed||0,
    openAssignments:Number(open.rows[0].n),
    disputes:Number(disputesCount.rows[0].n),
    pendingIdentity:Number(pending.rows[0].n),
    discipline:Number(discipline.rows[0].n),
    players:Number(players.rows[0].n),
    activePairs:Number(pairs.rows[0].n),
    clockPaused:clock.rows[0]?.value===true
  };
}

export async function auditLog(limit=100){
  const safe=Math.max(1,Math.min(250,Number(limit)||100));
  return (await pool.query(`
    SELECT a.id,a.action,a.target_type,a.target_id,a.data,a.created_at,
           u.first_name||' '||u.last_name AS admin_name
    FROM admin_audit_events a
    JOIN users u ON u.id=a.admin_user_id
    ORDER BY a.created_at DESC,a.id DESC
    LIMIT $1
  `,[safe])).rows;
}
export async function setLeagueClockPause(adminId,paused){const client=await pool.connect();try{await client.query('BEGIN');const current=(await client.query(`SELECT key,value FROM app_settings WHERE key IN('league_clock_paused','league_clock_pause_started_at') FOR UPDATE`)).rows;const map=Object.fromEntries(current.map(r=>[r.key,r.value]));const was=map.league_clock_paused===true;if(paused&&!was){await client.query(`UPDATE app_settings SET value='true'::jsonb,updated_at=now() WHERE key='league_clock_paused'`);await client.query(`UPDATE app_settings SET value=to_jsonb(now()::text),updated_at=now() WHERE key='league_clock_pause_started_at'`);}else if(!paused&&was){const started=map.league_clock_pause_started_at||null;if(started){const seconds=Number((await client.query(`SELECT GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP-$1::timestamptz))))::bigint seconds`,[started])).rows[0].seconds||0);await client.query(`UPDATE wheel_assignments SET deadline_at=deadline_at+($1||' seconds')::interval,extraordinary_deadline_at=CASE WHEN extraordinary_deadline_at IS NULL THEN NULL ELSE extraordinary_deadline_at+($1||' seconds')::interval END,confirmation_deadline_at=CASE WHEN confirmation_deadline_at IS NULL THEN NULL ELSE confirmation_deadline_at+($1||' seconds')::interval END WHERE status IN('open','result_pending','disputed')`,[seconds]);await client.query(`UPDATE wheel_schedule_proposals SET response_deadline_at=response_deadline_at+($1||' seconds')::interval WHERE status='pending'`,[seconds]);await client.query(`UPDATE wheel_no_shows SET response_deadline_at=response_deadline_at+($1||' seconds')::interval WHERE status='pending'`,[seconds]);await client.query(`UPDATE pair_invitations SET expires_at=expires_at+($1||' seconds')::interval WHERE status='pending'`,[seconds]);await client.query(`UPDATE pair_dissolution_requests SET deadline_at=deadline_at+($1||' seconds')::interval WHERE status IN('pending','confirmed','awaiting_result')`,[seconds]);}await client.query(`UPDATE app_settings SET value='false'::jsonb,updated_at=now() WHERE key='league_clock_paused'`);await client.query(`UPDATE app_settings SET value='null'::jsonb,updated_at=now() WHERE key='league_clock_pause_started_at'`);}await client.query(`INSERT INTO admin_audit_events(admin_user_id,action,target_type,data) VALUES($1,'league_clock','system',$2::jsonb)`,[adminId,JSON.stringify({paused:Boolean(paused)})]);await client.query('COMMIT');return {paused:Boolean(paused)};}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
export async function retryWhatsApp(){return dispatchWhatsAppOutbox();}
function b32(s){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of String(s).replace(/=+$/,'').toUpperCase()){const i=alphabet.indexOf(c);if(i<0)continue;bits+=i.toString(2).padStart(5,'0');}const out=[];for(let i=0;i+8<=bits.length;i+=8)out.push(parseInt(bits.slice(i,i+8),2));return Buffer.from(out);}
export function verifyTotp(secret,code){if(!secret)return false;const key=b32(secret);const now=Math.floor(Date.now()/1000/30);for(let drift=-1;drift<=1;drift++){const buf=Buffer.alloc(8);buf.writeBigUInt64BE(BigInt(now+drift));const h=crypto.createHmac('sha1',key).update(buf).digest();const off=h[h.length-1]&15;const n=((h[off]&0x7f)<<24)|((h[off+1]&255)<<16)|((h[off+2]&255)<<8)|(h[off+3]&255);if(String(n%1000000).padStart(6,'0')===String(code||''))return true;}return false;}
