import {safeBackgroundErrorLog} from './httpSecurity.js';

export async function runBackgroundTasks({
  maintenanceTask,
  outboxTask,
  logError=entry=>console.error(JSON.stringify(entry)),
  production=process.env.NODE_ENV==='production',
}){
  const tasks=[
    ['maintenance',maintenanceTask],
    ['whatsapp-outbox',outboxTask],
  ];
  const result=[];
  for(const [name,task] of tasks){
    try{
      await task();
      result.push({task:name,ok:true});
    }catch(err){
      const entry=safeBackgroundErrorLog(err,name,{production});
      logError(entry);
      result.push({task:name,ok:false});
    }
  }
  return result;
}
