import {safeBackgroundErrorLog} from './httpSecurity.js';

function closeServer(server,timeoutMs){
  return new Promise(resolve=>{
    if(!server?.close)return resolve();
    let settled=false;
    const done=()=>{if(!settled){settled=true;clearTimeout(timer);resolve();}};
    const timer=setTimeout(()=>{
      try{server.closeAllConnections?.();}catch{}
      done();
    },timeoutMs);
    timer.unref?.();
    try{server.close(()=>done());}catch{done();}
  });
}

export function createGracefulShutdown({
  server,
  pool,
  timers=[],
  timeoutMs=10000,
  logError=entry=>console.error(JSON.stringify(entry)),
  exit=code=>process.exit(code),
  production=process.env.NODE_ENV==='production',
}={}){
  let shuttingDown=null;
  return function shutdown(reason,{error=null,exitCode=0}={}){
    if(shuttingDown)return shuttingDown;
    shuttingDown=(async()=>{
      for(const timer of timers){
        if(timer)clearTimeout(timer);
      }
      if(error)logError(safeBackgroundErrorLog(error,`process:${reason}`,{production}));
      await closeServer(server,timeoutMs);
      try{await pool?.end?.();}catch(err){
        logError(safeBackgroundErrorLog(err,'shutdown:pool',{production}));
        exitCode=1;
      }
      exit(exitCode);
    })();
    return shuttingDown;
  };
}

export function installRuntimeHandlers({processRef=process,shutdown}={}){
  const onSigterm=()=>void shutdown('SIGTERM',{exitCode:0});
  const onSigint=()=>void shutdown('SIGINT',{exitCode:0});
  const onUnhandled=error=>void shutdown('unhandledRejection',{error,exitCode:1});
  const onUncaught=error=>void shutdown('uncaughtException',{error,exitCode:1});
  processRef.once('SIGTERM',onSigterm);
  processRef.once('SIGINT',onSigint);
  processRef.once('unhandledRejection',onUnhandled);
  processRef.once('uncaughtException',onUncaught);
  return ()=>{
    processRef.removeListener('SIGTERM',onSigterm);
    processRef.removeListener('SIGINT',onSigint);
    processRef.removeListener('unhandledRejection',onUnhandled);
    processRef.removeListener('uncaughtException',onUncaught);
  };
}


export function bindPoolErrorHandler({pool,shutdown}={}){
  const onPoolError=error=>void shutdown('postgres-pool',{error,exitCode:1});
  pool.on('error',onPoolError);
  return ()=>pool.removeListener('error',onPoolError);
}
