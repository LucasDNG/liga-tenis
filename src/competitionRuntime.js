import {pool,q} from './db.js';

export const SUPPORTED_ENGINES=new Set(['wheel-v2','wheel-v3']);
export const COMPETITIVE_WRITE_LOCK_KEY=8675311;

export async function competitiveEngine(client=pool){
  const row=(await q(client,`SELECT value FROM app_settings WHERE key='engine'`)).rows[0];
  const engine=row?.value;
  if(!SUPPORTED_ENGINES.has(engine))throw new Error('Motor competitivo inesperado');
  return engine;
}

export async function useCompetitiveEngine({v2,v3},...args){
  const engine=await competitiveEngine();
  return engine==='wheel-v3'?v3(...args):v2(...args);
}

export async function withCompetitiveWrite(callback){
  const lockClient=await pool.connect();
  let locked=false;
  try{
    await lockClient.query('SELECT pg_advisory_lock_shared($1::bigint)',[COMPETITIVE_WRITE_LOCK_KEY]);
    locked=true;
    const engine=await competitiveEngine(lockClient);
    return await callback(engine);
  }finally{
    if(locked){
      try{await lockClient.query('SELECT pg_advisory_unlock_shared($1::bigint)',[COMPETITIVE_WRITE_LOCK_KEY]);}
      catch{}
    }
    lockClient.release();
  }
}
