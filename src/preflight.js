import {wheelV3OperationalReadiness} from './wheelV3Cutover.js';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const verify=fs.readFileSync(path.resolve(__dirname,'../database/verify.sql'),'utf8');
const VERIFY_STATEMENTS=verify.split(';').map(s=>s.trim()).filter(Boolean);

export function databaseTlsInfo(client){
  const stream=client?.connection?.stream;
  const ssl=stream?.encrypted===true;
  const cipher=ssl&&typeof stream.getCipher==='function'?stream.getCipher():null;
  return {
    ssl,
    version:ssl&&typeof stream.getProtocol==='function'?(stream.getProtocol()||null):null,
    cipher:ssl?(cipher?.name||null):null,
  };
}

export async function databasePreflight(pool,{requireTls=true}={}){
  const ownsClient=typeof pool?.connect==='function';
  const client=ownsClient?await pool.connect():pool;
  try{
    let ssl={ssl:null,version:null,cipher:null};
    if(requireTls){
      ssl=databaseTlsInfo(client);
      if(!ssl.ssl)throw new Error('La conexión PostgreSQL de producción no está usando TLS');
    }

  const settings=(await client.query(`
    SELECT key,value
    FROM app_settings
    WHERE key IN('engine','timezone','league_clock_paused')
  `)).rows;
  const map=Object.fromEntries(settings.map(r=>[r.key,r.value]));
  if(!['wheel-v2','wheel-v3'].includes(map.engine))throw new Error('app_settings.engine inesperado');
  if(map.timezone!=='America/Argentina/Buenos_Aires')throw new Error('app_settings.timezone inesperada');
  if(map.league_clock_paused===true)throw new Error('El reloj global de la liga está pausado');

  const migrationColumn=Number((await client.query(`
    SELECT count(*) n
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='matches'
      AND column_name='abandoned_pair_id'
  `)).rows[0].n);
  const migrationConstraint=Number((await client.query(`
    SELECT count(*) n
    FROM pg_constraint
    WHERE conname='matches_abandonment_consistency'
      AND conrelid='matches'::regclass
  `)).rows[0].n);
  if(migrationColumn!==1||migrationConstraint!==1)throw new Error('Patch de abandono incompleto: ejecutá el startup productivo o npm run migrate:prod');

  const scheduleLocationColumns=Number((await client.query(`
    SELECT count(*) n FROM information_schema.columns
    WHERE table_schema='public'
      AND ((table_name='wheel_assignments' AND column_name='location_text')
        OR (table_name='wheel_schedule_proposals' AND column_name='location_text'))
  `)).rows[0].n);
  if(scheduleLocationColumns!==2)throw new Error('Patch de lugares libres incompleto: ejecutá el startup productivo o npm run migrate:prod');

  const adminCount=Number((await client.query(`
    SELECT count(*) n
    FROM users
    WHERE role='admin' AND verification_status='verified'
  `)).rows[0].n);
  if(adminCount<1)throw new Error('No hay ningún Admin verificado');

  const venueCount=Number((await client.query(`SELECT count(*) n FROM venues WHERE active=true`)).rows[0].n);

  let wheelV3Operational=null;
  if(map.engine==='wheel-v3'){
    wheelV3Operational=await wheelV3OperationalReadiness(client);
    if(!wheelV3Operational.ready){
      throw new Error('Wheel v3 operativo inconsistente: '+wheelV3Operational.blockers.join(', '));
    }
  }

  for(let i=3;i<VERIFY_STATEMENTS.length;i++){
    const result=await client.query(VERIFY_STATEMENTS[i]);
    if(result.rowCount>0)throw new Error('database/verify.sql detectó inconsistencia en control #'+(i-2));
  }

  const failed=(await client.query(`
    SELECT count(*)::int n,min(created_at) oldest
    FROM notification_outbox
    WHERE status='failed'
  `)).rows[0];
  const failedOutbox=Number(failed.n||0);

  return {
    ok:true,
    engine:map.engine,
    timezone:map.timezone,
    clockPaused:false,
    migrationReady:true,
    databaseTls:requireTls?Boolean(ssl.ssl):null,
    databaseTlsVersion:requireTls?(ssl.version||null):null,
    databaseTlsCipher:requireTls?(ssl.cipher||null):null,
    admins:adminCount,
    activeCommercialVenues:venueCount,
    wheelV3Operational,
    verifyControls:Math.max(0,VERIFY_STATEMENTS.length-3),
    failedOutbox,
    oldestFailedOutboxAt:failed.oldest||null,
  };
  }finally{
    if(ownsClient)client.release();
  }
}
