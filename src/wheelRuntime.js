import {problem} from './core.js';
import {competitiveEngine,withCompetitiveWrite} from './competitionRuntime.js';
import * as v2 from './wheel.js';
import * as v3 from './wheelV3Api.js';

async function route(v2fn,v3fn,args){
  const engine=await competitiveEngine();
  return engine==='wheel-v3'?v3fn(...args):v2fn(...args);
}

async function writeRoute(v2fn,v3fn,args){
  return withCompetitiveWrite(engine=>engine==='wheel-v3'?v3fn(...args):v2fn(...args));
}

export const myLeague=(...args)=>route(v2.myLeague,v3.myLeagueV3,args);
export const proposeSchedule=(...args)=>writeRoute(v2.proposeSchedule,v3.proposeScheduleV3,args);
export const acceptSchedule=(...args)=>writeRoute(v2.acceptSchedule,v3.acceptScheduleV3,args);

export async function cancelScheduleProposal(...args){
  return withCompetitiveWrite(async engine=>{
    if(engine!=='wheel-v3')throw problem('Acción disponible con Wheel v3',409);
    const [userId,assignmentId,proposalId]=args;
    const {pool}=await import('./db.js');
    const {currentPairForUser}=await import('./pairs.js');
    const {cancelWheelV3ScheduleProposal}=await import('./wheelV3Engine.js');
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const pair=await currentPairForUser(client,userId,{lock:true});
      if(!pair)throw problem('No tenés pareja vigente');
      const result=await cancelWheelV3ScheduleProposal(client,{assignmentId,proposalId,proposedByPairId:pair.id});
      await client.query('COMMIT');
      return result;
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  });
}
export const reportNoShow=(...args)=>writeRoute(v2.reportNoShow,v3.reportNoShowV3,args);
export const contestNoShow=(...args)=>writeRoute(v2.contestNoShow,v3.contestNoShowV3,args);
export const submitResult=(...args)=>writeRoute(v2.submitResult,v3.submitResultV3,args);
export const confirmResult=(...args)=>writeRoute(v2.confirmResult,v3.confirmResultV3,args);
export const publicUpcoming=(...args)=>route(v2.publicUpcoming,v3.publicUpcomingV3,args);
export const recentResults=(...args)=>route(v2.recentResults,v3.recentResultsV3,args);
export const ranking=(...args)=>route(v2.ranking,v3.rankingV3,args);
export const records=(...args)=>route(v2.records,v3.recordsV3,args);
export const pairProfile=(...args)=>route(v2.pairProfile,v3.pairProfileV3,args);
export const maintenance=(...args)=>writeRoute(v2.maintenance,v3.maintenanceV3,args);

export async function voteExtension(...args){
  return withCompetitiveWrite(async engine=>{
    if(engine==='wheel-v3')throw problem('Wheel v3 no utiliza extensión extraordinaria',410);
    return v2.voteExtension(...args);
  });
}

export async function cancelNoShow(...args){
  return withCompetitiveWrite(async engine=>{
    if(engine!=='wheel-v3')throw problem('Acción disponible con Wheel v3',409);
    return v3.cancelNoShowV3(...args);
  });
}

export async function acceptNoShow(...args){
  return withCompetitiveWrite(async engine=>{
    if(engine!=='wheel-v3')throw problem('Acción disponible con Wheel v3',409);
    return v3.acceptNoShowV3(...args);
  });
}

export async function reportOwnFailure(...args){
  return withCompetitiveWrite(async engine=>{
    if(engine!=='wheel-v3')throw problem('Acción disponible con Wheel v3',409);
    return v3.reportOwnFailureV3(...args);
  });
}
