import 'dotenv/config';
import pg from 'pg';
import {databasePoolOptions,productionConfigReport} from '../src/config.js';
import {databasePreflight} from '../src/preflight.js';

const modeArg=process.argv.find(arg=>arg.startsWith('--mode='));
const mode=String(modeArg?.slice('--mode='.length)||process.env.PREFLIGHT_MODE||'full').trim().toLowerCase();
if(!['core','full'].includes(mode))throw new Error('PREFLIGHT_MODE debe ser core o full');
const report=productionConfigReport(process.env,{strictIntegrations:mode==='full'});
for(const warning of report.warnings)console.warn('WARN:',warning);
if(report.errors.length){
  for(const error of report.errors)console.error('ERROR:',error);
  process.exit(1);
}

const {Pool}=pg;
const pool=new Pool(databasePoolOptions(process.env));

try{
  const result=await databasePreflight(pool,{requireTls:true});
  if(result.failedOutbox)console.warn('WARN: hay '+result.failedOutbox+' notificaciones WhatsApp fallidas pendientes de revisión');
  console.log(JSON.stringify({
    ...result,
    preflightMode:mode,
    whatsappGraphVersion:process.env.WHATSAPP_GRAPH_VERSION||null,
  }));
}finally{
  await pool.end();
}
