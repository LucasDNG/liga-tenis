import {safeBackgroundErrorLog} from './httpSecurity.js';

export async function prepareStartup({env=process.env,assertConfig,pool,applyMigrations}){
  const report=assertConfig(env);
  if(env.NODE_ENV!=='production')return {report,migrated:[]};

  const client=await pool.connect();
  try{
    const result=await applyMigrations(client);
    return {report,migrated:Array.isArray(result?.applied)?result.applied:[]};
  }finally{
    client.release();
  }
}

export function startupFailureEntry(err,{production=process.env.NODE_ENV==='production'}={}){
  return safeBackgroundErrorLog(err,'startup',{production});
}
