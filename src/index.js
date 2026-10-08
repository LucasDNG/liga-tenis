import 'dotenv/config';
import {assertRuntimeConfig} from './config.js';
import {app} from './app.js';
import {maintenance} from './wheelRuntime.js';
import {dispatchWhatsAppOutbox} from './notifications.js';
import {pool} from './db.js';
import {applyProductionMigrations} from './migrations.js';
import {runBackgroundTasks} from './background.js';
import {prepareStartup,startupFailureEntry} from './startup.js';
import {createGracefulShutdown,installRuntimeHandlers,bindPoolErrorHandler} from './runtimeLifecycle.js';

try{
  const startup=await prepareStartup({
    env:process.env,
    assertConfig:assertRuntimeConfig,
    pool,
    applyMigrations:applyProductionMigrations,
  });
  for(const warning of startup.report.warnings)console.warn('config warning:',warning);
  if(process.env.NODE_ENV==='production')console.log('production migrations ok:',startup.migrated.join(', '));

  const port=Number(process.env.PORT||3000);
  const server=app.listen(port,'0.0.0.0',()=>console.log(`LA RED Tenis API · runtime seleccionado por DB · ${port}`));

  async function tick(){await runBackgroundTasks({maintenanceTask:maintenance,outboxTask:dispatchWhatsAppOutbox});}
  const initialTick=setTimeout(tick,1500);
  const maintenanceInterval=setInterval(tick,60*60*1000);
  initialTick.unref();
  maintenanceInterval.unref();

  const shutdown=createGracefulShutdown({
    server,
    pool,
    timers:[initialTick,maintenanceInterval],
  });
  installRuntimeHandlers({shutdown});
  bindPoolErrorHandler({pool,shutdown});
  server.on('error',err=>void shutdown('listen',{error:err,exitCode:1}));
}catch(err){
  console.error(JSON.stringify(startupFailureEntry(err)));
  await pool.end().catch(()=>{});
  process.exitCode=1;
}
