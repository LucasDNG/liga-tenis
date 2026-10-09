import {competitiveEngine,withCompetitiveWrite} from './competitionRuntime.js';
import * as v2 from './pairs.js';
import * as v3 from './pairsV3Api.js';

async function route(v2fn,v3fn,args){
  const engine=await competitiveEngine();
  return engine==='wheel-v3'?v3fn(...args):v2fn(...args);
}

async function writeRoute(v2fn,v3fn,args){
  return withCompetitiveWrite(engine=>engine==='wheel-v3'?v3fn(...args):v2fn(...args));
}

export const pairHub=(...args)=>route(v2.pairHub,v3.pairHubV3,args);
export const invitePartner=(...args)=>writeRoute(v2.invitePartner,v3.invitePartnerV3,args);
export const cancelInvitation=(...args)=>writeRoute(v2.cancelInvitation,v3.cancelInvitationV3,args);
export const acceptInvitation=(...args)=>writeRoute(v2.acceptInvitation,v3.acceptInvitationV3,args);
export const reactivatePair=(...args)=>writeRoute(v2.reactivatePair,v3.reactivatePairV3,args);
export const requestDissolution=(...args)=>writeRoute(v2.requestDissolution,v3.requestDissolutionV3,args);

export async function requestPause(userId,afterCurrent=false){
  return withCompetitiveWrite(async engine=>{
    if(engine==='wheel-v3')return v3.requestPauseV3(userId);
    return v2.requestPause(userId,afterCurrent);
  });
}
