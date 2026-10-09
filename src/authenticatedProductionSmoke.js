import {sign} from './auth.js';

function normalizeHttps(value,label){
  const raw=String(value||'').trim();
  if(!raw)throw new Error(label+' es obligatorio');
  let url=null;
  try{url=new URL(raw);}catch{}
  if(!url||url.protocol!=='https:')throw new Error(label+' debe usar HTTPS');
  if(url.username||url.password||url.search||url.hash)throw new Error(label+' debe ser un origen HTTPS limpio');
  if(url.pathname&&url.pathname!=='/')throw new Error(label+' debe ser un origen HTTPS sin path');
  return url.origin;
}

async function jsonRequest(fetchImpl,url,{token,origin}={}){
  const headers={Accept:'application/json'};
  if(token)headers.Authorization='Bearer '+token;
  if(origin)headers.Origin=origin;
  const response=await fetchImpl(url,{headers});
  let data=null;
  try{data=await response.json();}catch{}
  return {response,data};
}

function assertOk(result,label){
  if(!result.response.ok)throw new Error(label+' respondió HTTP '+result.response.status);
  if(result.response.headers.get('cache-control')!=='no-store')throw new Error(label+' no envía Cache-Control: no-store');
  return result.data;
}

export async function runAuthenticatedProductionSmoke({pool,apiUrl,frontendUrl,fetchImpl=globalThis.fetch}){
  const api=normalizeHttps(apiUrl,'PROD_API_URL');
  const frontend=normalizeHttps(frontendUrl,'PROD_FRONTEND_URL');

  const admin=(await pool.query(`
    SELECT id,role
    FROM users
    WHERE role='admin' AND verification_status='verified'
    ORDER BY id
    LIMIT 1
  `)).rows[0];
  if(!admin)throw new Error('No hay Admin verificado para smoke autenticado');

  const paired=(await pool.query(`
    SELECT DISTINCT u.id,u.role
    FROM users u
    JOIN pair_members pm ON pm.user_id=u.id
    JOIN pairs p ON p.id=pm.pair_id
    WHERE u.verification_status='verified'
      AND u.role<>'admin'
      AND p.competition_state IN('active','paused')
    ORDER BY u.id
    LIMIT 1
  `)).rows[0];

  const player=paired||(await pool.query(`
    SELECT id,role
    FROM users
    WHERE verification_status='verified' AND role<>'admin'
    ORDER BY id
    LIMIT 1
  `)).rows[0]||null;

  const adminToken=sign(admin);
  const playerToken=player?sign(player):null;

  const anonymous=await jsonRequest(fetchImpl,api+'/api/me',{origin:frontend});
  if(anonymous.response.status!==401)throw new Error('Endpoint privado no rechaza acceso anónimo');

  const adminMe=assertOk(await jsonRequest(fetchImpl,api+'/api/me',{token:adminToken,origin:frontend}),'GET /api/me Admin');
  if(Number(adminMe?.id)!==Number(admin.id))throw new Error('GET /api/me devolvió un Admin distinto');

  const adminStatus=assertOk(await jsonRequest(fetchImpl,api+'/api/admin/status',{token:adminToken,origin:frontend}),'GET /api/admin/status');
  if(adminStatus?.engine!=='wheel-v3')throw new Error('Admin status no informa wheel-v3');

  const adminReads=[
    '/api/admin/audit?limit=5',
    '/api/admin/identity/pending',
    '/api/admin/venues',
    '/api/admin/disputes',
    '/api/admin/discipline',
  ];
  for(const path of adminReads){
    assertOk(await jsonRequest(fetchImpl,api+path,{token:adminToken,origin:frontend}),'GET '+path);
  }

  let playerReads=0;
  let leagueChecked=false;
  if(playerToken){
    const me=assertOk(await jsonRequest(fetchImpl,api+'/api/me',{token:playerToken,origin:frontend}),'GET /api/me jugador');
    if(Number(me?.id)!==Number(player.id))throw new Error('GET /api/me devolvió un jugador distinto');
    assertOk(await jsonRequest(fetchImpl,api+'/api/me/notifications',{token:playerToken,origin:frontend}),'GET /api/me/notifications');
    const pair=assertOk(await jsonRequest(fetchImpl,api+'/api/me/pair',{token:playerToken,origin:frontend}),'GET /api/me/pair');
    playerReads=3;
    if(paired&&pair?.pair){
      assertOk(await jsonRequest(fetchImpl,api+'/api/me/league',{token:playerToken,origin:frontend}),'GET /api/me/league');
      playerReads++;
      leagueChecked=true;
    }

    const forbidden=await jsonRequest(fetchImpl,api+'/api/admin/status',{token:playerToken,origin:frontend});
    if(forbidden.response.status!==403)throw new Error('Jugador pudo acceder a endpoint Admin');
  }

  return {
    ok:true,
    engine:'wheel-v3',
    anonymousRejected:true,
    adminVerified:true,
    adminReadEndpoints:adminReads.length+2,
    whatsappConfigured:Boolean(adminStatus?.whatsapp),
    whatsappOutboxPending:Number(adminStatus?.outboxPending||0),
    whatsappOutboxFailed:Number(adminStatus?.outboxFailed||0),
    playerAvailable:Boolean(playerToken),
    playerReadEndpoints:playerReads,
    pairedPlayerAvailable:Boolean(paired),
    leagueChecked,
  };
}
