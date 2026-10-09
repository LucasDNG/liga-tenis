import {pool,q} from './db.js';
import {whatsappConfiguration} from './config.js';

export async function queueUserNotification(client,{userId,type,title,body,payload={},dedupeKey,whatsapp=true,overridePhone=null}){
  const row=(await q(client,`
    INSERT INTO notifications(user_id,type,title,body,payload,dedupe_key)
    VALUES($1,$2,$3,$4,$5::jsonb,$6)
    ON CONFLICT(dedupe_key) DO NOTHING
    RETURNING id
  `,[userId,type,title,body,JSON.stringify(payload),dedupeKey])).rows[0];

  if(whatsapp){
    await q(client,`
      INSERT INTO notification_outbox(user_id,channel,type,payload,dedupe_key)
      VALUES($1,'whatsapp',$2,$3::jsonb,$4)
      ON CONFLICT(dedupe_key) DO NOTHING
    `,[userId,type,JSON.stringify({body,...payload,overridePhone}),`wa:${dedupeKey}`]);
  }
  return row;
}

export async function pairUserIds(client,pairId){
  return (await q(client,`
    SELECT user_id
    FROM pair_members
    WHERE pair_id=$1
    ORDER BY user_id
  `,[pairId])).rows.map(r=>Number(r.user_id));
}

export async function queuePairNotification(client,pairId,msg){
  for(const userId of await pairUserIds(client,pairId)){
    await queueUserNotification(client,{userId,...msg,dedupeKey:`${msg.dedupeKey}:u${userId}`});
  }
}

export async function queueAssignmentNotification(client,a,msg){
  await queuePairNotification(client,a.pair_a_id,msg);
  await queuePairNotification(client,a.pair_b_id,msg);
}

function metaConfigured(){return whatsappConfiguration().configured;}

export async function sendWhatsAppTemplate(phone,payload){
  const to=String(payload.overridePhone||phone||'').replace(/\D/g,'');
  if(!to)throw new Error('Usuario sin teléfono');
  const version=String(process.env.WHATSAPP_GRAPH_VERSION||'').trim();
  if(!/^v\d+\.\d+$/.test(version))throw new Error('WhatsApp Graph version no configurada');
  if(!metaConfigured())throw new Error('WhatsApp incompleto: se requieren las cinco variables Meta');
  const url=`https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const body={
    messaging_product:'whatsapp',
    to,
    type:'template',
    template:{
      name:process.env.WHATSAPP_TEMPLATE_NAME,
      language:{code:process.env.WHATSAPP_TEMPLATE_LANGUAGE},
      components:[{
        type:'body',
        parameters:[{
          type:'text',
          text:String(payload.body||'Tenés una novedad en LA RED').slice(0,1000),
        }],
      }],
    },
  };
  const r=await fetch(url,{
    method:'POST',
    headers:{
      Authorization:`Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type':'application/json',
    },
    body:JSON.stringify(body),
  });
  if(!r.ok){
    let code=null,subcode=null;
    try{
      const parsed=JSON.parse(await r.text());
      code=parsed?.error?.code??null;
      subcode=parsed?.error?.error_subcode??null;
    }catch{}
    throw new Error(`WhatsApp HTTP ${r.status}${code!==null?` code=${code}`:''}${subcode!==null?` subcode=${subcode}`:''}`);
  }
}

export async function expireObsoleteWhatsAppOutbox(client){
  const result=await q(client,`
    UPDATE notification_outbox o
    SET status='expired',
        last_error='obsolete_before_delivery'
    WHERE o.channel='whatsapp'
      AND o.status IN('pending','failed')
      AND (
        (
          o.type='password_recovery'
          AND NOT EXISTS (
            SELECT 1
            FROM password_recovery_codes c
            WHERE c.id=CASE
              WHEN o.payload->>'recoveryId' ~ '^[0-9]+$'
              THEN (o.payload->>'recoveryId')::bigint
              ELSE NULL
            END
              AND c.used_at IS NULL
              AND c.expires_at>CURRENT_TIMESTAMP
          )
        )
        OR
        (
          o.type='pair_invitation'
          AND NOT EXISTS (
            SELECT 1
            FROM pair_invitations i
            WHERE i.id=CASE
              WHEN o.payload->>'invitationId' ~ '^[0-9]+$'
              THEN (o.payload->>'invitationId')::bigint
              ELSE NULL
            END
              AND i.status='pending'
              AND i.expires_at>CURRENT_TIMESTAMP
          )
        )
        OR
        (
          o.type='phone_change'
          AND NOT EXISTS (
            SELECT 1
            FROM phone_change_codes c
            WHERE c.id=COALESCE(
              CASE
                WHEN o.payload->>'phoneChangeId' ~ '^[0-9]+$'
                THEN (o.payload->>'phoneChangeId')::bigint
                ELSE NULL
              END,
              CASE
                WHEN o.dedupe_key ~ '^phone-change-code:[0-9]+$'
                THEN split_part(o.dedupe_key,':',2)::bigint
                ELSE NULL
              END
            )
              AND c.used_at IS NULL
              AND c.expires_at>CURRENT_TIMESTAMP
          )
        )
      )
    RETURNING id
  `);
  return {expired:result.rowCount};
}

export async function dispatchWhatsAppOutbox(limit=30){
  const configured=metaConfigured();
  const client=await pool.connect();
  let rows=[];
  let expired=0;
  try{
    await client.query('BEGIN');
    expired=(await expireObsoleteWhatsAppOutbox(client)).expired;

    if(!configured){
      await client.query('COMMIT');
      return {configured:false,sent:0,failed:0,expired};
    }

    rows=(await q(client,`
      SELECT o.*,u.phone
      FROM notification_outbox o
      JOIN users u ON u.id=o.user_id
      WHERE o.status IN('pending','failed')
        AND o.next_attempt_at<=CURRENT_TIMESTAMP
      ORDER BY o.created_at,o.id
      LIMIT $1
      FOR UPDATE OF o SKIP LOCKED
    `,[limit])).rows;

    if(rows.length){
      await q(client,`
        UPDATE notification_outbox
        SET attempts=attempts+1,
            next_attempt_at=CURRENT_TIMESTAMP+interval '15 minutes'
        WHERE id=ANY($1::bigint[])
      `,[rows.map(r=>r.id)]);
    }
    await client.query('COMMIT');
  }catch(e){
    await client.query('ROLLBACK');
    throw e;
  }finally{
    client.release();
  }

  let sent=0,failed=0;
  for(const r of rows){
    try{
      await sendWhatsAppTemplate(r.phone,r.payload||{});
      await pool.query(`
        UPDATE notification_outbox
        SET status='sent',sent_at=CURRENT_TIMESTAMP,last_error=NULL
        WHERE id=$1
      `,[r.id]);
      sent++;
    }catch(e){
      await pool.query(`
        UPDATE notification_outbox
        SET status='failed',
            last_error=$2,
            next_attempt_at=CURRENT_TIMESTAMP+interval '30 minutes'
        WHERE id=$1
      `,[r.id,String(e.message).slice(0,1000)]);
      failed++;
    }
  }
  return {configured:true,sent,failed,expired};
}
